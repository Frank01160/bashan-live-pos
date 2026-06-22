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
        const nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
        const threshold = product.lowStockThreshold || this.settings?.lowStockThreshold || 100;
        const stock = product.currentStockKg || 0;
        
        let status, statusClass, rowClass, stockBarClass;
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
        
        const stockPercentage = Math.min(100, Math.max(0, (stock / (nguniaSize * 10)) * 100));
        const categoryName = this.categories.find(c => c.id === product.category)?.name || product.category || 'Uncategorized';
        
        return `
            <tr class="${rowClass}" data-product-id="${product.id}">
                <td class="product-name-cell">${product.name || 'Unnamed'}</td>
                <td>${categoryName}</td>
                <td>${nguniaSize} kg</td>
                <td class="stock-display">
                    ${BashanPOS.formatStock(stock, nguniaSize)}
                    <div class="stock-level-bar">
                        <div class="stock-level-fill ${stockBarClass}" style="width:${stockPercentage}%"></div>
                    </div>
                </td>
                <td>${BashanPOS.formatCurrency(product.pricePerKg || 0)}/kg</td>
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
        const lowStock = this.products.filter(p => (p.currentStockKg || 0) <= threshold && (p.currentStockKg || 0) > 0).length;
        const outOfStock = this.products.filter(p => (p.currentStockKg || 0) <= 0).length;
        const totalValue = this.products.reduce((sum, p) => sum + ((p.currentStockKg || 0) * (p.pricePerKg || 0)), 0);
        
        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('lowStockCount').textContent = lowStock;
        document.getElementById('outOfStockCount').textContent = outOfStock;
        document.getElementById('totalValue').textContent = BashanPOS.formatCurrency(totalValue);
    }
    
    // ============ STOCK ADJUSTMENT ============
    openAdjustModal(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;
        
        this.currentAdjustProduct = product;
        this.adjustmentType = 'add';
        
        document.getElementById('adjustModalTitle').textContent = `Adjust Stock - ${product.name}`;
        document.getElementById('adjustProductInfo').innerHTML = `
            <div class="product-name-lg">${product.name}</div>
            <div class="product-meta">
                <span>Current: ${BashanPOS.formatStock(product.currentStockKg || 0, product.nguniaKg || 1000)}</span>
                <span>Price: ${BashanPOS.formatCurrency(product.pricePerKg || 0)}/kg</span>
            </div>
        `;
        document.getElementById('currentStockDisplay').textContent = BashanPOS.formatStock(product.currentStockKg || 0, product.nguniaKg || 1000);
        
        // Reset form
        document.getElementById('adjNgunias').value = '0';
        document.getElementById('adjKg').value = '0';
        document.getElementById('adjReason').value = '';
        document.getElementById('adjOtherReason').value = '';
        document.getElementById('adjNotes').value = '';
        document.getElementById('adjTotalDisplay').textContent = '0 kg (0 ngunias)';
        document.getElementById('newStockDisplay').textContent = BashanPOS.formatStock(product.currentStockKg || 0, product.nguniaKg || 1000);
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
        
        const nguniaSize = this.currentAdjustProduct.nguniaKg || this.settings?.nguniaDefault || 1000;
        const ngunias = parseFloat(document.getElementById('adjNgunias').value) || 0;
        const kg = parseFloat(document.getElementById('adjKg').value) || 0;
        const totalKg = (ngunias * nguniaSize) + kg;
        
        if (totalKg <= 0) {
            BashanPOS.showNotification('Please enter a quantity', 'warning');
            return;
        }
        
        if (this.adjustmentType === 'remove' && totalKg > (this.currentAdjustProduct.currentStockKg || 0)) {
            BashanPOS.showNotification('Cannot remove more than current stock', 'error');
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
            ? (this.currentAdjustProduct.currentStockKg || 0) + totalKg
            : (this.currentAdjustProduct.currentStockKg || 0) - totalKg;
        
        const confirmed = await BashanPOS.showConfirm(
            `${this.adjustmentType === 'add' ? 'Add' : 'Remove'} ${totalKg.toFixed(2)} kg ` +
            `(${(totalKg / nguniaSize).toFixed(3)} ngunias) ${this.adjustmentType === 'add' ? 'to' : 'from'} ` +
            `${this.currentAdjustProduct.name}?\n\nReason: ${finalReason}`
        );
        
        if (!confirmed) return;
        
        const result = await BashanPOS.updateStock(
            this.currentAdjustProduct.id,
            newStock,
            finalReason,
            notes,
            this.user.name,
            this.user.id
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
    
    // ============ ADD/EDIT PRODUCT ============
    openAddProduct() {
        document.getElementById('productModalTitle').textContent = 'Add New Product';
        document.getElementById('editProductId').value = '';
        document.getElementById('productName').value = '';
        document.getElementById('productCategory').value = '';
        document.getElementById('productPrice').value = '';
        document.getElementById('productNguniaSize').value = this.settings?.nguniaDefault || 1000;
        document.getElementById('productInitNgunias').value = '0';
        document.getElementById('productInitKg').value = '0';
        document.getElementById('productThreshold').value = this.settings?.lowStockThreshold || 100;
        
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
        const pricePerKg = parseFloat(document.getElementById('productPrice').value);
        const nguniaSize = parseInt(document.getElementById('productNguniaSize').value);
        const initNgunias = parseFloat(document.getElementById('productInitNgunias').value) || 0;
        const initKg = parseFloat(document.getElementById('productInitKg').value) || 0;
        const threshold = parseInt(document.getElementById('productThreshold').value) || 100;
        
        // Validation
        if (!name) {
            BashanPOS.showNotification('Product name is required', 'warning');
            return;
        }
        if (isNaN(pricePerKg) || pricePerKg <= 0) {
            BashanPOS.showNotification('Valid price is required', 'warning');
            return;
        }
        if (isNaN(nguniaSize) || nguniaSize <= 0) {
            BashanPOS.showNotification('Valid ngunia size is required', 'warning');
            return;
        }
        
        const totalStock = (initNgunias * nguniaSize) + initKg;
        
        if (isNaN(totalStock) || totalStock < 0) {
            BashanPOS.showNotification('Invalid stock calculation', 'error');
            return;
        }
        
        const productData = {
            name: name,
            category: category || '',
            pricePerKg: pricePerKg,
            nguniaKg: nguniaSize,
            currentStockKg: totalStock,
            lowStockThreshold: threshold,
            archived: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log('💾 Saving product:', productData);
        
        try {
            if (editId) {
                await BashanPOS.productsRef.doc(editId).update(productData);
                BashanPOS.showNotification('Product updated successfully!', 'success');
                BashanPOS.logAudit('PRODUCT_EDIT', `Edited product: ${name}`);
            } else {
                productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await BashanPOS.productsRef.add(productData);
                BashanPOS.showNotification('Product added successfully!', 'success');
                BashanPOS.logAudit('PRODUCT_ADD', `Added product: ${name}`);
            }
            
            this.closeProductModal();
            await this.loadProducts();
        } catch (error) {
            console.error('❌ Save product error:', error);
            BashanPOS.showNotification('Failed to save product: ' + error.message, 'error');
        }
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
