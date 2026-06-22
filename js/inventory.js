// ============================================
// BASHAAN POS - INVENTORY MANAGEMENT ENGINE
// ============================================

class InventorySystem {
    constructor() {
        this.user = null;
        this.settings = null;
        this.products = [];
        this.categories = [];
        this.currentAdjustProduct = null;
        this.adjustmentType = 'add';
        this.historyData = [];
        
        this.init();
    }
    
    async init() {
        // Check if BashanPOS is loaded
        if (!window.BashanPOS) {
            console.error('❌ BashanPOS not loaded. Retrying...');
            setTimeout(() => this.init(), 500);
            return;
        }
        
        this.user = BashanPOS.checkAuth();
        if (!this.user) return;
        
        // Only managers can access full inventory
        if (this.user.role !== 'manager') {
            BashanPOS.showNotification('Only managers can access inventory management', 'warning');
            setTimeout(() => window.location.href = 'pos.html', 2000);
            return;
        }
        
        this.settings = await BashanPOS.getSettings();
        
        this.setupUI();
        this.setupEventListeners();
        await this.initializeCategories();
        await this.loadProducts();
        this.loadStats();
        
        BashanPOS.logAudit('INVENTORY_OPEN', 'Inventory page loaded');
        console.log('✅ Inventory System Ready');
    }
    
    setupUI() {
        document.getElementById('userName').textContent = this.user.name;
        document.getElementById('userRole').textContent = this.user.role;
    }
    
    setupEventListeners() {
        // Search and filters
        document.getElementById('searchInventory').addEventListener('input', () => this.renderTable());
        document.getElementById('filterCategory').addEventListener('change', () => this.renderTable());
        document.getElementById('filterStatus').addEventListener('change', () => this.renderTable());
        
        // Export
        document.getElementById('exportInventoryBtn').addEventListener('click', () => this.exportInventory());
        //for item type
        this.setupStockInputListeners();

        
        // Adjustment modal
        document.getElementById('closeAdjustModal').addEventListener('click', () => this.closeAdjustModal());
        document.getElementById('cancelAdjustBtn').addEventListener('click', () => this.closeAdjustModal());
        document.getElementById('addTab').addEventListener('click', () => this.setAdjustmentType('add'));
        document.getElementById('removeTab').addEventListener('click', () => this.setAdjustmentType('remove'));
        document.getElementById('adjNgunias').addEventListener('input', () => this.calculateAdjustment());
        document.getElementById('adjKg').addEventListener('input', () => this.calculateAdjustment());
        document.getElementById('adjReason').addEventListener('change', (e) => {
            document.getElementById('otherReasonGroup').style.display = e.target.value === 'Other' ? 'block' : 'none';
        });
        document.getElementById('confirmAdjustBtn').addEventListener('click', () => this.confirmAdjustment());
        document.getElementById('confirmRemoveBtn').addEventListener('click', () => this.confirmAdjustment());
        
        // History modal
        document.getElementById('historyBtn').addEventListener('click', () => this.openHistory());
        document.getElementById('closeHistoryModal').addEventListener('click', () => this.closeHistory());
        document.getElementById('historyProduct').addEventListener('change', () => this.loadHistory());
        document.getElementById('historyType').addEventListener('change', () => this.loadHistory());
        document.getElementById('exportHistoryBtn').addEventListener('click', () => this.exportHistory());
        
        // Add product modal
        document.getElementById('addProductBtn').addEventListener('click', () => this.openAddProduct());
        document.getElementById('closeProductModal').addEventListener('click', () => this.closeProductModal());
        document.getElementById('cancelProductBtn').addEventListener('click', () => this.closeProductModal());
        document.getElementById('saveProductBtn').addEventListener('click', () => this.saveProduct());
        
        // Make category dropdown searchable/typeable
        this.setupCategoryDropdown();
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => BashanPOS.logout());
        
        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    overlay.classList.remove('active');
                }
            });
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            }
        });
    }
    
    // ============ CATEGORIES ============
    async initializeCategories() {
        try {
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            
            if (snapshot.empty) {
                // No categories exist - create defaults
                console.log('📝 Creating default categories...');
                await this.createDefaultCategories();
                // Reload
                const newSnapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
                this.processCategories(newSnapshot);
            } else {
                this.processCategories(snapshot);
            }
            
            this.populateCategoryDropdowns();
            console.log('✅ Categories loaded:', this.categories.length);
        } catch (error) {
            console.error('❌ Load categories error:', error);
            // Try to create defaults on error
            await this.createDefaultCategories();
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            this.processCategories(snapshot);
            this.populateCategoryDropdowns();
        }
    }
    
    processCategories(snapshot) {
        this.categories = [];
        snapshot.forEach(doc => {
            this.categories.push({ id: doc.id, ...doc.data() });
        });
    }
    
    async createDefaultCategories() {
        const defaults = [
            { name: 'Feeds', displayOrder: 0 },
            { name: 'Insecticides', displayOrder: 1 },
            { name: 'Supplements', displayOrder: 2 },
            { name: 'Seeds', displayOrder: 3 },
            { name: 'Equipment', displayOrder: 4 },
            { name: 'Medicines', displayOrder: 5 },
            { name: 'Other', displayOrder: 6 }
        ];
        
        const batch = BashanPOS.db.batch();
        
        defaults.forEach(cat => {
            const ref = BashanPOS.categoriesRef.doc();
            batch.set(ref, {
                name: cat.name,
                displayOrder: cat.displayOrder,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await batch.commit();
        console.log('✅ Default categories created');
    }
    
    setupCategoryDropdown() {
        const productCategory = document.getElementById('productCategory');
        
        // Make it so user can type custom category or select from list
        productCategory.addEventListener('change', (e) => {
            const value = e.target.value;
            
            // If user typed something that's not in the list, ask if they want to add it
            if (value && value !== '__add_new__' && !this.categories.find(c => c.id === value || c.name === value)) {
                // User typed a custom category
                this.addCustomCategory(value);
            }
            
            if (value === '__add_new__') {
                const newCat = prompt('Enter new category name:');
                if (newCat && newCat.trim()) {
                    this.addCustomCategory(newCat.trim());
                } else {
                    productCategory.value = '';
                }
            }
        });
    }
    
    async addCustomCategory(categoryName) {
        try {
            // Check if category already exists
            const exists = this.categories.find(c => 
                c.name.toLowerCase() === categoryName.toLowerCase()
            );
            
            if (exists) {
                document.getElementById('productCategory').value = exists.id;
                return;
            }
            
            // Add new category
            const docRef = await BashanPOS.categoriesRef.add({
                name: categoryName,
                displayOrder: this.categories.length,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Reload categories
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            this.processCategories(snapshot);
            this.populateCategoryDropdowns();
            
            // Set the new category as selected
            document.getElementById('productCategory').value = docRef.id;
            
            BashanPOS.showNotification(`Category "${categoryName}" added!`, 'success');
            BashanPOS.logAudit('CATEGORY_ADD', `Added category: ${categoryName}`);
        } catch (error) {
            console.error('Add category error:', error);
            BashanPOS.showNotification('Failed to add category', 'error');
        }
    }
    
    populateCategoryDropdowns() {
        const filterSelect = document.getElementById('filterCategory');
        const productSelect = document.getElementById('productCategory');
        const historySelect = document.getElementById('historyProduct');
        
        // Populate filter dropdown
        filterSelect.innerHTML = '<option value="all">All Categories</option>';
        this.categories.forEach(cat => {
            filterSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
        
        // Populate product form dropdown - NOW WITH TYPEABLE OPTION
        productSelect.innerHTML = '<option value="">Select or type category...</option>';
        this.categories.forEach(cat => {
            productSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
        // Add "add new" option
        productSelect.innerHTML += '<option value="__add_new__" style="color: #4caf50; font-style: italic;">+ Add New Category...</option>';
        
        // Populate history product filter
        if (historySelect) {
            historySelect.innerHTML = '<option value="all">All Products</option>';
            this.products.forEach(p => {
                historySelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
            });
        }
    }
    
    // ============ PRODUCTS ============
    async loadProducts() {
        try {
            const snapshot = await BashanPOS.productsRef.where('archived', '==', false).get();
            this.products = [];
            snapshot.forEach(doc => {
                this.products.push({ id: doc.id, ...doc.data() });
            });
            
            console.log('✅ Products loaded:', this.products.length);
            this.renderTable();
            this.loadStats();
            this.populateCategoryDropdowns();
        } catch (error) {
            console.error('❌ Load products error:', error);
            BashanPOS.showNotification('Failed to load products', 'error');
            
            // Show error in table
            const tbody = document.getElementById('inventoryTableBody');
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">
                        <p>⚠️ Failed to load products</p>
                        <p style="font-size:12px;color:var(--danger);">${error.message}</p>
                        <button onclick="location.reload()" class="outline-btn" style="margin-top:10px;">🔄 Retry</button>
                    </td>
                </tr>
            `;
        }
    }
    
    getFilteredProducts() {
        const searchTerm = document.getElementById('searchInventory').value.toLowerCase();
        const categoryFilter = document.getElementById('filterCategory').value;
        const statusFilter = document.getElementById('filterStatus').value;
        
        return this.products.filter(product => {
            const matchesSearch = !searchTerm || 
                (product.name && product.name.toLowerCase().includes(searchTerm));
            const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
            
            const stock = product.currentStockKg || 0;
            const threshold = product.lowStockThreshold || 100;
            
            let matchesStatus = true;
            if (statusFilter === 'in-stock') {
                matchesStatus = stock > threshold;
            } else if (statusFilter === 'low-stock') {
                matchesStatus = stock <= threshold && stock > 0;
            } else if (statusFilter === 'out-of-stock') {
                matchesStatus = stock <= 0;
            }
            
            return matchesSearch && matchesCategory && matchesStatus;
        });
    }
    
    renderTable() {
        const filtered = this.getFilteredProducts();
        const tbody = document.getElementById('inventoryTableBody');
        
        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">
                        <p>📦 No products found</p>
                        <p style="font-size:12px;">Try adjusting your filters or add a new product</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = filtered.map(product => this.createTableRow(product)).join('');
        
        // Add action handlers
        tbody.querySelectorAll('.action-btn.adjust').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('tr').dataset.productId;
                this.openAdjustModal(productId);
            });
        });
        
        tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('tr').dataset.productId;
                this.openEditProduct(productId);
            });
        });
        
        tbody.querySelectorAll('.action-btn.archive').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const productId = e.target.closest('tr').dataset.productId;
                await this.archiveProduct(productId);
            });
        });
    }
    createTableRow(product) {
    const uom = product.uom || 'kg';
    const nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
    const threshold = product.lowStockThreshold || this.settings?.lowStockThreshold || 100;
    
    let stock = 0;
    let stockDisplay = '';
    let priceDisplay = '';
    let status = '';
    let statusClass = '';
    let rowClass = '';
    let stockBarClass = '';
    let maxForBar = 100;
    
    switch(uom) {
        case 'kg':
            stock = product.currentStockKg || 0;
            maxForBar = nguniaSize * 10;
            stockDisplay = BashanPOS.formatStock(stock, nguniaSize);
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerKg || 0)}/kg`;
            break;
            
        case 'bags':
            stock = product.currentStockCount || 0;
            maxForBar = 50;
            stockDisplay = `${stock} bags (${product.kgPerBag || 50}kg each)`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerBag || 0)}/bag`;
            break;
            
        case 'litres':
            stock = product.currentStockLitres || 0;
            maxForBar = 100;
            stockDisplay = `${stock.toFixed(2)} litres`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerLitre || 0)}/L`;
            break;
            
        case 'ml':
            stock = product.currentStockMl || 0;
            maxForBar = 5000;
            stockDisplay = `${stock.toFixed(0)} mL`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePer100ml || 0)}/100mL`;
            break;
            
        case 'pieces':
            stock = product.currentStockCount || 0;
            maxForBar = 100;
            stockDisplay = `${stock} pieces`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerPiece || 0)}/pc`;
            break;
            
        case 'grams':
            stock = product.currentStockGrams || 0;
            maxForBar = 5000;
            stockDisplay = `${stock}g`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerGram || 0)}/g`;
            break;
            
        case 'sachets':
            stock = product.currentStockCount || 0;
            maxForBar = 100;
            stockDisplay = `${stock} sachets`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerSachet || 0)}/sachet`;
            break;
            
        case 'cartons':
            stock = product.currentStockCount || 0;
            maxForBar = 20;
            const itemsPerCarton = product.itemsPerCarton || 12;
            stockDisplay = `${stock} cartons (${stock * itemsPerCarton} pcs)`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerCarton || 0)}/carton`;
            break;
            
        case 'rolls':
            stock = product.currentStockCount || 0;
            maxForBar = 30;
            stockDisplay = `${stock} rolls`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerRoll || 0)}/roll`;
            break;
            
        case 'metres':
            stock = product.currentStockMetres || 0;
            maxForBar = 200;
            stockDisplay = `${stock.toFixed(2)} metres`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerMetre || 0)}/m`;
            break;
            
        default:
            stock = product.currentStockKg || 0;
            maxForBar = nguniaSize * 10;
            stockDisplay = BashanPOS.formatStock(stock, nguniaSize);
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerKg || 0)}/kg`;
    }
    
    // Determine status
    if (stock <= 0) {
        status = 'Out of Stock';
        statusClass = 'out-of-stock';
        rowClass = 'out-of-stock-row';
        stockBarClass = 'low';
    } else if (stock <= threshold) {
        status = 'Low Stock';
        statusClass = 'low-stock';
        rowClass = 'low-stock-row';
        stockBarClass = 'medium';
    } else {
        status = 'In Stock';
        statusClass = 'in-stock';
        rowClass = '';
        stockBarClass = 'good';
    }
    
    const stockPercentage = Math.min(100, Math.max(0, (stock / maxForBar) * 100));
    const categoryName = this.categories.find(c => c.id === product.category)?.name || product.category || 'Uncategorized';
    const uomBadge = `<span class="uom-badge-inline">${uom}</span>`;
    
    return `
        <tr class="${rowClass}" data-product-id="${product.id}">
            <td class="product-name-cell">${product.name || 'Unnamed'} ${uomBadge}</td>
            <td>${categoryName}</td>
            <td>${uom !== 'kg' ? '-' : (nguniaSize + ' kg')}</td>
            <td class="stock-display">
                ${stockDisplay}
                <div class="stock-level-bar">
                    <div class="stock-level-fill ${stockBarClass}" style="width:${stockPercentage}%"></div>
                </div>
            </td>
            <td>${priceDisplay}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn adjust">📦 Adjust</button>
                    <button class="action-btn edit">✏️ Edit</button>
                    <button class="action-btn archive">🗑️ Archive</button>
                </div>
            </td>
        </tr>
    `;
}
    loadStats() {
    const threshold = this.settings?.lowStockThreshold || 100;
    
    const totalProducts = this.products.length;
    
    // Count low stock and out of stock based on UOM
    let lowStock = 0;
    let outOfStock = 0;
    let totalValue = 0;
    
    this.products.forEach(p => {
        const uom = p.uom || 'kg';
        let stock = 0;
        let value = 0;
        let productThreshold = p.lowStockThreshold || threshold;
        
        switch(uom) {
            case 'kg':
                stock = p.currentStockKg || 0;
                value = stock * (p.pricePerKg || 0);
                break;
            case 'bags':
                stock = p.currentStockCount || 0;
                value = stock * (p.pricePerBag || 0);
                break;
            case 'litres':
                stock = p.currentStockLitres || 0;
                value = stock * (p.pricePerLitre || 0);
                break;
            case 'ml':
                stock = p.currentStockMl || 0;
                value = stock * (p.pricePer100ml || 0);
                break;
            case 'pieces':
                stock = p.currentStockCount || 0;
                value = stock * (p.pricePerPiece || 0);
                break;
            case 'grams':
                stock = p.currentStockGrams || 0;
                value = stock * (p.pricePerGram || 0);
                break;
            case 'sachets':
                stock = p.currentStockCount || 0;
                value = stock * (p.pricePerSachet || 0);
                break;
            case 'cartons':
                stock = p.currentStockCount || 0;
                value = stock * (p.pricePerCarton || 0);
                break;
            case 'rolls':
                stock = p.currentStockCount || 0;
                value = stock * (p.pricePerRoll || 0);
                break;
            case 'metres':
                stock = p.currentStockMetres || 0;
                value = stock * (p.pricePerMetre || 0);
                break;
            default:
                stock = p.currentStockKg || 0;
                value = stock * (p.pricePerKg || 0);
        }
        
        if (stock <= 0) outOfStock++;
        else if (stock <= productThreshold) lowStock++;
        
        totalValue += value;
    });
    
    document.getElementById('totalProducts').textContent = totalProducts;
    document.getElementById('lowStockCount').textContent = lowStock;
    document.getElementById('outOfStockCount').textContent = outOfStock;
    document.getElementById('totalValue').textContent = BashanPOS.formatCurrency(totalValue);
}
    
    // ============ STOCK ADJUSTMENT ============openAdjustModal(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;
    
    this.currentAdjustProduct = product;
    this.adjustmentType = 'add';
    
    const uom = product.uom || 'kg';
    let stockDisplay = '';
    let priceDisplay = '';
    
    switch(uom) {
        case 'kg':
            stockDisplay = BashanPOS.formatStock(product.currentStockKg || 0, product.nguniaKg || 1000);
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerKg || 0)}/kg`;
            break;
        case 'bags':
            stockDisplay = `${product.currentStockCount || 0} bags`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerBag || 0)}/bag`;
            break;
        case 'litres':
            stockDisplay = `${(product.currentStockLitres || 0).toFixed(2)} L`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerLitre || 0)}/L`;
            break;
        case 'ml':
            stockDisplay = `${(product.currentStockMl || 0).toFixed(0)} mL`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePer100ml || 0)}/100mL`;
            break;
        case 'pieces':
            stockDisplay = `${product.currentStockCount || 0} pieces`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerPiece || 0)}/pc`;
            break;
        case 'grams':
            stockDisplay = `${product.currentStockGrams || 0}g`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerGram || 0)}/g`;
            break;
        case 'sachets':
            stockDisplay = `${product.currentStockCount || 0} sachets`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerSachet || 0)}/sachet`;
            break;
        case 'cartons':
            stockDisplay = `${product.currentStockCount || 0} cartons`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerCarton || 0)}/carton`;
            break;
        case 'rolls':
            stockDisplay = `${product.currentStockCount || 0} rolls`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerRoll || 0)}/roll`;
            break;
        case 'metres':
            stockDisplay = `${(product.currentStockMetres || 0).toFixed(2)} m`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerMetre || 0)}/m`;
            break;
        default:
            stockDisplay = BashanPOS.formatStock(product.currentStockKg || 0, 1000);
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerKg || 0)}/kg`;
    }
    
    document.getElementById('adjustModalTitle').textContent = `Adjust Stock - ${product.name}`;
    document.getElementById('adjustProductInfo').innerHTML = `
        <div class="product-name-lg">${product.name} <span class="uom-badge-inline">${uom}</span></div>
        <div class="product-meta">
            <span>Current: ${stockDisplay}</span>
            <span>Price: ${priceDisplay}</span>
        </div>
    `;
    document.getElementById('currentStockDisplay').textContent = stockDisplay;
    
    // Reset form
    document.getElementById('adjNgunias').value = '0';
    document.getElementById('adjKg').value = '0';
    document.getElementById('adjReason').value = '';
    document.getElementById('adjOtherReason').value = '';
    document.getElementById('adjNotes').value = '';
    document.getElementById('adjTotalDisplay').textContent = '0';
    document.getElementById('newStockDisplay').textContent = stockDisplay;
    document.getElementById('otherReasonGroup').style.display = 'none';
    
    this.setAdjustmentType('add');
    
    document.getElementById('adjustStockModal').classList.add('active');
}
    
    setAdjustmentType(type) {
        this.adjustmentType = type;
        
        document.getElementById('addTab').classList.toggle('active', type === 'add');
        document.getElementById('removeTab').classList.toggle('active', type === 'remove');
        
        document.getElementById('adjTypeText').textContent = type === 'add' ? 'add' : 'remove';
        document.getElementById('confirmAdjustBtn').style.display = type === 'add' ? 'inline-flex' : 'none';
        document.getElementById('confirmRemoveBtn').style.display = type === 'remove' ? 'inline-flex' : 'none';
        
        this.calculateAdjustment();
    }
    
    calculateAdjustment() {
        if (!this.currentAdjustProduct) return;
        
        const nguniaSize = this.currentAdjustProduct.nguniaKg || this.settings?.nguniaDefault || 1000;
        const ngunias = parseFloat(document.getElementById('adjNgunias').value) || 0;
        const kg = parseFloat(document.getElementById('adjKg').value) || 0;
        const totalKg = (ngunias * nguniaSize) + kg;
        
        document.getElementById('adjTotalDisplay').textContent = 
            `${totalKg.toFixed(2)} kg (${(totalKg / nguniaSize).toFixed(3)} ngunias)`;
        
        const currentStock = this.currentAdjustProduct.currentStockKg || 0;
        const newStock = this.adjustmentType === 'add' ? currentStock + totalKg : currentStock - totalKg;
        document.getElementById('newStockDisplay').textContent = 
            BashanPOS.formatStock(Math.max(0, newStock), nguniaSize);
    }
    async confirmAdjustment() {
    if (!this.currentAdjustProduct) return;
    
    const product = this.currentAdjustProduct;
    const uom = product.uom || 'kg';
    const nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
    const ngunias = parseFloat(document.getElementById('adjNgunias').value) || 0;
    const kg = parseFloat(document.getElementById('adjKg').value) || 0;
    
    let totalChange = 0;
    let currentStock = 0;
    let unitLabel = '';
    
    // Calculate based on UOM
    switch(uom) {
        case 'kg':
            totalChange = (ngunias * nguniaSize) + kg;
            currentStock = product.currentStockKg || 0;
            unitLabel = 'kg';
            break;
        case 'bags':
            totalChange = ngunias + kg; // ngunias field used as bags, kg as extra
            currentStock = product.currentStockCount || 0;
            unitLabel = 'bags';
            break;
        default:
            // For non-kg UOMs, use the ngunias field as the main quantity
            totalChange = ngunias + kg;
            currentStock = this.getCurrentStockForUOM(product, uom);
            unitLabel = uom;
    }
    
    if (totalChange <= 0) {
        BashanPOS.showNotification('Please enter a quantity', 'warning');
        return;
    }
    
    if (this.adjustmentType === 'remove' && totalChange > currentStock) {
        BashanPOS.showNotification(`Cannot remove more than current stock (${currentStock} ${unitLabel})`, 'error');
        return;
    }
    
    const reason = document.getElementById('adjReason').value;
    const otherReason = document.getElementById('adjOtherReason').value;
    
    if (!reason) {
        BashanPOS.showNotification('Please select a reason', 'warning');
        return;
    }
    
    const finalReason = reason === 'Other' ? otherReason : reason;
    if (reason === 'Other' && !otherReason) {
        BashanPOS.showNotification('Please specify the reason', 'warning');
        return;
    }
    
    const notes = document.getElementById('adjNotes').value;
    const newStock = this.adjustmentType === 'add' 
        ? currentStock + totalChange
        : currentStock - totalChange;
    
    const confirmed = await BashanPOS.showConfirm(
        `${this.adjustmentType === 'add' ? 'Add' : 'Remove'} ${totalChange} ${unitLabel} ` +
        `${this.adjustmentType === 'add' ? 'to' : 'from'} ${product.name}?\n\n` +
        `Current: ${currentStock} ${unitLabel}\n` +
        `New: ${newStock} ${unitLabel}\n\n` +
        `Reason: ${finalReason}`
    );
    
    if (!confirmed) return;
    
    // Call updateStock with UOM
    const result = await BashanPOS.updateStock(
        product.id,
        newStock,
        finalReason,
        notes,
        this.user.name,
        this.user.id,
        uom  // Pass UOM
    );
    
    if (result.success) {
        BashanPOS.showNotification('Stock adjusted successfully!', 'success');
        this.closeAdjustModal();
        await this.loadProducts();
    } else {
        BashanPOS.showNotification('Failed to adjust stock: ' + result.message, 'error');
    }
}
    
    closeAdjustModal() {
        document.getElementById('adjustStockModal').classList.remove('active');
        this.currentAdjustProduct = null;
    }
    openAddProduct() {
    document.getElementById('productModalTitle').textContent = 'Add New Product';
    document.getElementById('editProductId').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productCategory').value = '';
    document.getElementById('productUOM').value = 'kg';
    document.getElementById('productUOMHidden').value = 'kg';
    document.getElementById('productPrice').value = '';
    document.getElementById('productNguniaSize').value = this.settings?.nguniaDefault || 1000;
    document.getElementById('productInitNgunias').value = '0';
    document.getElementById('productInitKg').value = '0';
    document.getElementById('productInitBags').value = '0';
    document.getElementById('productInitVolume').value = '0';
    document.getElementById('productInitCount').value = '0';
    document.getElementById('productInitCartons').value = '0';
    document.getElementById('productInitLength').value = '0';
    document.getElementById('kgPerBag').value = '50';
    document.getElementById('itemsPerCarton').value = '12';
    document.getElementById('productThreshold').value = this.settings?.lowStockThreshold || 100;
    
    this.handleUOMChange();
    
    document.getElementById('addProductModal').classList.add('active');
}
    
    openEditProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        const nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
        const stock = product.currentStockKg || 0;
        const ngunias = Math.floor(stock / nguniaSize);
        const remainder = stock % nguniaSize;
        
        document.getElementById('productModalTitle').textContent = 'Edit Product';
        document.getElementById('editProductId').value = product.id;
        document.getElementById('productName').value = product.name || '';
        document.getElementById('productCategory').value = product.category || '';
        document.getElementById('productPrice').value = product.pricePerKg || '';
        document.getElementById('productNguniaSize').value = nguniaSize;
        document.getElementById('productInitNgunias').value = ngunias;
        document.getElementById('productInitKg').value = remainder.toFixed(2);
        document.getElementById('productThreshold').value = product.lowStockThreshold || 100;
        
        document.getElementById('addProductModal').classList.add('active');
    }
    async saveProduct() {
    const editId = document.getElementById('editProductId').value;
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value;
    const uom = document.getElementById('productUOM').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const threshold = parseInt(document.getElementById('productThreshold').value) || 0;
    
    if (!name) {
        BashanPOS.showNotification('Product name is required', 'warning');
        return;
    }
    if (isNaN(price) || price <= 0) {
        BashanPOS.showNotification('Valid price is required', 'warning');
        return;
    }
    
    let stockQuantity = 0;
    let productData = {
        name: name,
        category: category || '',
        uom: uom,
        price: price,
        lowStockThreshold: threshold,
        archived: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    switch(uom) {
        case 'kg':
            const ngunias = parseFloat(document.getElementById('productInitNgunias')?.value) || 0;
            const extraKg = parseFloat(document.getElementById('productInitKg')?.value) || 0;
            const nguniaSize = parseInt(document.getElementById('productNguniaSize')?.value) || 1000;
            
            if (isNaN(nguniaSize) || nguniaSize <= 0) {
                BashanPOS.showNotification('Valid ngunia size is required', 'warning');
                return;
            }
            
            stockQuantity = (ngunias * nguniaSize) + extraKg;
            productData.nguniaKg = nguniaSize;
            productData.pricePerKg = price;
            productData.currentStockKg = stockQuantity;
            break;
            
        case 'bags':
            const bags = parseInt(document.getElementById('productInitBags')?.value) || 0;
            const kgPerBag = parseFloat(document.getElementById('kgPerBag')?.value) || 50;
            
            if (isNaN(kgPerBag) || kgPerBag <= 0) {
                BashanPOS.showNotification('Valid weight per bag is required', 'warning');
                return;
            }
            
            stockQuantity = bags;
            productData.kgPerBag = kgPerBag;
            productData.pricePerBag = price;
            productData.currentStockCount = bags;
            productData.currentStockKg = bags * kgPerBag;
            break;
            
        case 'litres':
            stockQuantity = parseFloat(document.getElementById('productInitVolume')?.value) || 0;
            productData.pricePerLitre = price;
            productData.currentStockLitres = stockQuantity;
            break;
            
        case 'ml':
            stockQuantity = parseFloat(document.getElementById('productInitVolume')?.value) || 0;
            productData.pricePer100ml = price;
            productData.currentStockMl = stockQuantity;
            break;
            
        case 'pieces':
            stockQuantity = parseInt(document.getElementById('productInitCount')?.value) || 0;
            productData.pricePerPiece = price;
            productData.currentStockCount = stockQuantity;
            break;
            
        case 'grams':
            stockQuantity = parseInt(document.getElementById('productInitCount')?.value) || 0;
            productData.pricePerGram = price;
            productData.currentStockGrams = stockQuantity;
            break;
            
        case 'sachets':
            stockQuantity = parseInt(document.getElementById('productInitCount')?.value) || 0;
            productData.pricePerSachet = price;
            productData.currentStockCount = stockQuantity;
            break;
            
        case 'cartons':
            const cartons = parseInt(document.getElementById('productInitCartons')?.value) || 0;
            const itemsPerCarton = parseInt(document.getElementById('itemsPerCarton')?.value) || 12;
            
            if (isNaN(itemsPerCarton) || itemsPerCarton < 1) {
                BashanPOS.showNotification('Valid items per carton is required', 'warning');
                return;
            }
            
            stockQuantity = cartons;
            productData.itemsPerCarton = itemsPerCarton;
            productData.pricePerCarton = price;
            productData.currentStockCount = cartons;
            productData.currentStockPieces = cartons * itemsPerCarton;
            break;
            
        case 'rolls':
            stockQuantity = parseFloat(document.getElementById('productInitLength')?.value) || 0;
            productData.pricePerRoll = price;
            productData.currentStockCount = stockQuantity;
            break;
            
        case 'metres':
            stockQuantity = parseFloat(document.getElementById('productInitLength')?.value) || 0;
            productData.pricePerMetre = price;
            productData.currentStockMetres = stockQuantity;
            break;
    }
    
    if (isNaN(stockQuantity) || stockQuantity < 0) {
        BashanPOS.showNotification('Invalid stock calculation', 'error');
        return;
    }
    
    console.log('💾 Saving product:', productData);
    
    try {
        if (editId) {
            await BashanPOS.productsRef.doc(editId).update(productData);
            BashanPOS.showNotification('Product updated successfully!', 'success');
            BashanPOS.logAudit('PRODUCT_EDIT', `Edited product: ${name} (${uom})`);
        } else {
            productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await BashanPOS.productsRef.add(productData);
            BashanPOS.showNotification('Product added successfully!', 'success');
            BashanPOS.logAudit('PRODUCT_ADD', `Added product: ${name} (${uom})`);
        }
        
        this.closeProductModal();
        await this.loadProducts();
    } catch (error) {
        console.error('❌ Save product error:', error);
        BashanPOS.showNotification('Failed to save product: ' + error.message, 'error');
    }
}
    handleUOMChange() {
    const uom = document.getElementById('productUOM').value;
    document.getElementById('productUOMHidden').value = uom;
    
    const groups = [
        'stockKgInputs', 'stockBagsInputs', 'stockVolumeInputs',
        'stockCountInputs', 'stockCartonInputs', 'stockLengthInputs',
        'nguniaSizeGroup', 'kgPerBagGroup'
    ];
    groups.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    switch(uom) {
        case 'kg':
            document.getElementById('stockKgInputs').style.display = 'flex';
            document.getElementById('nguniaSizeGroup').style.display = 'block';
            document.getElementById('priceLabel').textContent = 'Price per Kilogram (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per kg';
            document.getElementById('mainUnitLabel1').textContent = 'Ngunias/Bags';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (kg)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this amount in kg';
            document.getElementById('productThreshold').value = this.settings?.lowStockThreshold || 100;
            break;
            
        case 'bags':
            document.getElementById('stockBagsInputs').style.display = 'flex';
            document.getElementById('kgPerBagGroup').style.display = 'block';
            document.getElementById('priceLabel').textContent = 'Price per Bag (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per bag';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (bags)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this many bags';
            document.getElementById('productThreshold').value = 5;
            break;
            
        case 'litres':
            document.getElementById('stockVolumeInputs').style.display = 'flex';
            document.getElementById('volumeLabel').textContent = 'Quantity (Litres)';
            document.getElementById('priceLabel').textContent = 'Price per Litre (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per litre';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (litres)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this amount in litres';
            document.getElementById('productThreshold').value = 10;
            break;
            
        case 'ml':
            document.getElementById('stockVolumeInputs').style.display = 'flex';
            document.getElementById('volumeLabel').textContent = 'Quantity (Millilitres)';
            document.getElementById('priceLabel').textContent = 'Price per 100mL (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per 100mL';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (mL)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this amount in mL';
            document.getElementById('productThreshold').value = 500;
            break;
            
        case 'pieces':
            document.getElementById('stockCountInputs').style.display = 'flex';
            document.getElementById('countLabel').textContent = 'Quantity (Pieces)';
            document.getElementById('priceLabel').textContent = 'Price per Piece (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per piece';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (pieces)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this many pieces';
            document.getElementById('productThreshold').value = 10;
            break;
            
        case 'grams':
            document.getElementById('stockCountInputs').style.display = 'flex';
            document.getElementById('countLabel').textContent = 'Quantity (Grams)';
            document.getElementById('priceLabel').textContent = 'Price per Gram (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per gram';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (grams)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this amount in grams';
            document.getElementById('productThreshold').value = 500;
            break;
            
        case 'sachets':
            document.getElementById('stockCountInputs').style.display = 'flex';
            document.getElementById('countLabel').textContent = 'Quantity (Sachets/Packets)';
            document.getElementById('priceLabel').textContent = 'Price per Sachet (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per sachet/packet';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (sachets)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this many sachets';
            document.getElementById('productThreshold').value = 20;
            break;
            
        case 'cartons':
            document.getElementById('stockCartonInputs').style.display = 'flex';
            document.getElementById('priceLabel').textContent = 'Price per Carton (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per carton';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (cartons)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this many cartons';
            document.getElementById('productThreshold').value = 2;
            break;
            
        case 'rolls':
            document.getElementById('stockLengthInputs').style.display = 'flex';
            document.getElementById('priceLabel').textContent = 'Price per Roll (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per roll';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (rolls)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this many rolls';
            document.getElementById('productThreshold').value = 3;
            break;
            
        case 'metres':
            document.getElementById('stockLengthInputs').style.display = 'flex';
            document.getElementById('priceLabel').textContent = 'Price per Metre (KSH) *';
            document.getElementById('priceHint').textContent = 'Enter the price per metre';
            document.getElementById('thresholdLabel').textContent = 'Low Stock Threshold (metres)';
            document.getElementById('thresholdHint').textContent = 'Alert when stock falls below this many metres';
            document.getElementById('productThreshold').value = 20;
            break;
    }
    
    this.updateStockTotalDisplay();
}

setupStockInputListeners() {
    const stockInputs = [
        'productInitNgunias', 'productInitKg', 'productInitBags',
        'productInitVolume', 'productInitCount', 'productInitCartons',
        'itemsPerCarton', 'productInitLength', 'productNguniaSize', 'kgPerBag'
    ];
    
    stockInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => this.updateStockTotalDisplay());
        }
    });
}

updateStockTotalDisplay() {
    const uom = document.getElementById('productUOM')?.value || 'kg';
    const totalDisplay = document.getElementById('totalStockDisplay');
    if (!totalDisplay) return;
    
    let displayText = '';
    
    switch(uom) {
        case 'kg':
            const ngunias = parseFloat(document.getElementById('productInitNgunias')?.value) || 0;
            const extraKg = parseFloat(document.getElementById('productInitKg')?.value) || 0;
            const nguniaSize = parseInt(document.getElementById('productNguniaSize')?.value) || 1000;
            const totalKg = (ngunias * nguniaSize) + extraKg;
            displayText = `${totalKg.toFixed(2)} kg (${(totalKg / nguniaSize).toFixed(3)} ngunias)`;
            break;
            
        case 'bags':
            const bags = parseInt(document.getElementById('productInitBags')?.value) || 0;
            const kgPerBag = parseFloat(document.getElementById('kgPerBag')?.value) || 50;
            const bagsTotalKg = bags * kgPerBag;
            const bagsTotalEl = document.getElementById('productBagsTotalKg');
            if (bagsTotalEl) bagsTotalEl.value = bagsTotalKg.toFixed(2);
            displayText = `${bags} bags (${bagsTotalKg.toFixed(2)} kg total)`;
            break;
            
        case 'litres':
            const litres = parseFloat(document.getElementById('productInitVolume')?.value) || 0;
            displayText = `${litres.toFixed(2)} litres`;
            break;
            
        case 'ml':
            const ml = parseFloat(document.getElementById('productInitVolume')?.value) || 0;
            displayText = `${ml.toFixed(0)} mL (${(ml / 1000).toFixed(3)} L)`;
            break;
            
        case 'pieces':
        case 'grams':
            const count = parseInt(document.getElementById('productInitCount')?.value) || 0;
            displayText = `${count} ${uom}`;
            break;
            
        case 'sachets':
            const sachets = parseInt(document.getElementById('productInitCount')?.value) || 0;
            displayText = `${sachets} sachets/packets`;
            break;
            
        case 'cartons':
            const cartons = parseInt(document.getElementById('productInitCartons')?.value) || 0;
            const itemsPerCarton = parseInt(document.getElementById('itemsPerCarton')?.value) || 12;
            displayText = `${cartons} cartons (${cartons * itemsPerCarton} total items)`;
            break;
            
        case 'rolls':
            const rolls = parseFloat(document.getElementById('productInitLength')?.value) || 0;
            displayText = `${rolls} rolls`;
            break;
            
        case 'metres':
            const metres = parseFloat(document.getElementById('productInitLength')?.value) || 0;
            displayText = `${metres.toFixed(2)} metres`;
            break;
    }
    
    totalDisplay.textContent = displayText;
}
    closeProductModal() {
        document.getElementById('addProductModal').classList.remove('active');
    }
    
    async archiveProduct(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        const confirmed = await BashanPOS.showConfirm(
            `Archive "${product.name}"?\n\nThis product will be hidden but not deleted.`
        );
        
        if (!confirmed) return;
        
        try {
            await BashanPOS.productsRef.doc(productId).update({
                archived: true,
                archivedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            BashanPOS.showNotification('Product archived', 'success');
            BashanPOS.logAudit('PRODUCT_ARCHIVE', `Archived product: ${product.name}`);
            await this.loadProducts();
        } catch (error) {
            BashanPOS.showNotification('Failed to archive product', 'error');
        }
    }
    
    // ============ STOCK HISTORY ============
    async openHistory() {
        document.getElementById('historyModal').classList.add('active');
        await this.loadHistory();
    }
    
    async loadHistory() {
        try {
            const productFilter = document.getElementById('historyProduct').value;
            const typeFilter = document.getElementById('historyType').value;
            
            let query = BashanPOS.stockLogRef.orderBy('timestamp', 'desc').limit(200);
            
            if (productFilter !== 'all') {
                query = query.where('productId', '==', productFilter);
            }
            
            const snapshot = await query.get();
            this.historyData = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (typeFilter === 'all' || data.type === typeFilter) {
                    this.historyData.push({ id: doc.id, ...data });
                }
            });
            
            this.renderHistory();
        } catch (error) {
            console.error('Load history error:', error);
            document.getElementById('historyTableBody').innerHTML = 
                '<tr><td colspan="8" style="text-align:center;padding:30px;">Failed to load history</td></tr>';
        }
    }
    
    renderHistory() {
        const tbody = document.getElementById('historyTableBody');
        
        if (this.historyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;">No stock movements found</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.historyData.map(log => `
            <tr>
                <td>${BashanPOS.formatDate(log.timestamp)}</td>
                <td>${log.productName}</td>
                <td><span class="type-badge ${log.type}">${log.type === 'add' ? 'Added' : 'Removed'}</span></td>
                <td>${(log.quantityKg || 0).toFixed(2)} kg (${(log.quantityNgunia || 0).toFixed(3)} ngunias)</td>
                <td>${(log.beforeStock || 0).toFixed(2)} kg</td>
                <td>${(log.afterStock || 0).toFixed(2)} kg</td>
                <td>${log.reason}</td>
                <td>${log.doneByName}</td>
            </tr>
        `).join('');
    }
    
    closeHistory() {
        document.getElementById('historyModal').classList.remove('active');
    }
    
    // ============ EXPORT ============
    exportInventory() {
        const filtered = this.getFilteredProducts();
        
        if (filtered.length === 0) {
            BashanPOS.showNotification('No data to export', 'warning');
            return;
        }
        
        let csv = 'Product,Category,Ngunia Size (kg),Current Stock (kg),Price/kg (KSH),Stock Value,Status\n';
        
        filtered.forEach(p => {
            const nguniaSize = p.nguniaKg || 1000;
            const stock = p.currentStockKg || 0;
            const status = stock <= 0 ? 'Out of Stock' : 
                          stock <= (p.lowStockThreshold || 100) ? 'Low Stock' : 'In Stock';
            const categoryName = this.categories.find(c => c.id === p.category)?.name || 'N/A';
            
            csv += `"${p.name}","${categoryName}",${nguniaSize},${stock},${p.pricePerKg || 0},${stock * (p.pricePerKg || 0)},"${status}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        BashanPOS.showNotification('Inventory exported!', 'success');
    }
    
    exportHistory() {
        if (this.historyData.length === 0) {
            BashanPOS.showNotification('No history to export', 'warning');
            return;
        }
        
        let csv = 'Date,Product,Type,Quantity (kg),Quantity (ngunias),Before,After,Reason,Done By\n';
        
        this.historyData.forEach(log => {
            csv += `"${BashanPOS.formatDate(log.timestamp)}","${log.productName}","${log.type}",` +
                   `${log.quantityKg || 0},${log.quantityNgunia || 0},${log.beforeStock || 0},${log.afterStock || 0},` +
                   `"${log.reason}","${log.doneByName}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stock_history_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize
let inventorySystem;
document.addEventListener('DOMContentLoaded', () => {
    inventorySystem = new InventorySystem();
    window.inventorySystem = inventorySystem;
});
