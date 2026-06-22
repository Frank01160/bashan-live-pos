// ============================================
// BASHAAN POS - MAIN POS ENGINE
// ============================================

class BashanPOSSystem {
    constructor() {
        // Core state
        this.user = null;
        this.settings = null;
        this.products = [];
        this.categories = [];
        this.cart = [];
        this.selectedCategory = 'all';
        this.lowStockProducts = [];
        this.todaySales = { total: 0, count: 0 };
        this.lastSale = null;
        
        // Real-time listeners
        this.productsUnsubscribe = null;
        this.salesUnsubscribe = null;
        
        // Init
        this.init();
    }
    


  async init() {
    // Check if BashanPOS is loaded
    if (!window.BashanPOS) {
        console.error('❌ BashanPOS not loaded. Retrying in 1 second...');
        setTimeout(() => this.init(), 1000);
        return;
    }
    
    // Check auth
    this.user = BashanPOS.checkAuth();
    if (!this.user) return;
    
    // ... rest of your init code
        // Check auth
        this.user = BashanPOS.checkAuth();
        if (!this.user) return;
        
        // Load settings
        this.settings = await BashanPOS.getSettings();
        
        // Setup UI
        this.setupUI();
        this.setupClock();
        this.setupEventListeners();
        
        // Load data
        await this.loadCategories();
        this.loadProductsRealtime();
        this.loadTodaySales();
        
        // Restore cart if exists
        this.restoreCart();
        
        // Check low stock
        this.checkLowStock();
        
        // Log
        BashanPOS.logAudit('POS_OPEN', 'POS page loaded');
        
        console.log('🔥 POS System Ready');
    }
    
    // ============ UI SETUP ============
setupUI() {
    // User badge
    document.querySelector('.badge-name').textContent = this.user.name;
    document.querySelector('.badge-role').textContent = this.user.role;
    
    // Role-based restrictions
    if (this.user.role === 'seller') {
        // Seller can't access some features
        document.getElementById('reportsBtn').style.display = 'none';
    }
    
    // ========== FLOATING MANAGER MENU ==========
    
    // Show floating menu ONLY for managers
    if (this.user.role === 'manager') {
        document.getElementById('floatingMenu').style.display = 'block';
    }
    
    // FAB click toggle
    document.getElementById('fabMain').addEventListener('click', () => {
        document.getElementById('fabMain').classList.toggle('active');
        document.getElementById('fabSubmenu').classList.toggle('open');
    });
    
    // Close submenu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.floating-menu')) {
            document.getElementById('fabMain').classList.remove('active');
            document.getElementById('fabSubmenu').classList.remove('open');
        }
    });
    
    // Reports button in FAB
    document.getElementById('fabReports').addEventListener('click', () => {
        document.getElementById('fabMain').classList.remove('active');
        document.getElementById('fabSubmenu').classList.remove('open');
        this.openReports();
    });
    
    // Logout in FAB
    document.getElementById('fabLogout').addEventListener('click', () => {
        BashanPOS.logout();
    });
}
    
    setupClock() {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-KE', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            const dateStr = now.toLocaleDateString('en-KE', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            document.getElementById('liveClock').textContent = timeStr;
            document.getElementById('dateDisplay').textContent = dateStr;
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }
    
    setupEventListeners() {
        // Search
        document.getElementById('searchProducts').addEventListener('input', (e) => {
            this.filterProducts(e.target.value);
        });
        
        // Discount input
        document.getElementById('discountInput').addEventListener('input', () => {
            this.updateCartSummary();
        });
        
        // Complete sale
        document.getElementById('completeSaleBtn').addEventListener('click', () => {
            this.completeSale();
        });
        
        // Clear cart
        document.getElementById('clearCartBtn').addEventListener('click', () => {
            this.clearCart();
        });
        
        // Reports
        document.getElementById('reportsBtn').addEventListener('click', () => {
            this.openReports();
        });
        document.getElementById('closeReports').addEventListener('click', () => {
            this.closeReports();
        });
        document.getElementById('loadReportBtn').addEventListener('click', () => {
            this.loadReport();
        });
        document.getElementById('reportPeriod').addEventListener('change', (e) => {
            const customDates = document.getElementById('customDates');
            customDates.style.display = e.target.value === 'custom' ? 'flex' : 'none';
        });
        
        // Export buttons
        document.getElementById('exportCSV').addEventListener('click', () => this.exportCSV());
        document.getElementById('exportPDF').addEventListener('click', () => this.exportPDF());
        document.getElementById('printReport').addEventListener('click', () => this.printReport());
        
        // Success modal
        document.getElementById('printReceiptBtn').addEventListener('click', () => this.printReceipt());
        document.getElementById('downloadReceiptBtn').addEventListener('click', () => this.downloadReceiptPDF());
        document.getElementById('newSaleBtn').addEventListener('click', () => this.newSale());
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            BashanPOS.logout('User logout');
        });
        
        // Alert bell
        document.getElementById('alertBell').addEventListener('click', () => {
            this.toggleStockAlerts();
        });
        document.getElementById('dismissAlert').addEventListener('click', () => {
            this.dismissStockAlerts();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter to complete sale
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.completeSale();
            }
            // Escape to clear cart
            if (e.key === 'Escape') {
                this.clearCart();
            }
        });
        
        // Close overlays on click outside
        document.getElementById('reportsOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeReports();
        });
        document.getElementById('successModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.newSale();
        });
        
        // Handle page unload - save cart
        window.addEventListener('beforeunload', () => {
            this.saveCart();
        });
    }
    
    // ============ CATEGORIES ============
    async loadCategories() {
        try {
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            this.categories = [];
            const tabsContainer = document.getElementById('categoryTabs');
            
            // Keep the "All" tab
            tabsContainer.innerHTML = '<button class="cat-tab active" data-category="all">All</button>';
            
            snapshot.forEach(doc => {
                const category = { id: doc.id, ...doc.data() };
                this.categories.push(category);
                
                const tab = document.createElement('button');
                tab.className = 'cat-tab';
                tab.dataset.category = doc.id;
                tab.textContent = category.name;
                tab.addEventListener('click', () => this.selectCategory(doc.id, tab));
                tabsContainer.appendChild(tab);
            });
            
            // "All" tab click
            tabsContainer.querySelector('[data-category="all"]').addEventListener('click', function() {
                document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                window.posSystem.selectCategory('all');
            });
            
        } catch (error) {
            console.error('Load categories error:', error);
            // Create default categories if none exist
            await this.createDefaultCategories();
        }
    }
    
    async createDefaultCategories() {
        const defaults = ['Feeds', 'Insecticides', 'Supplements', 'Seeds', 'Equipment'];
        const batch = BashanPOS.db.batch();
        
        defaults.forEach((name, index) => {
            const ref = BashanPOS.categoriesRef.doc();
            batch.set(ref, { name, displayOrder: index, createdAt: new Date() });
        });
        
        await batch.commit();
        await this.loadCategories();
    }
    
    selectCategory(categoryId, tabElement = null) {
        this.selectedCategory = categoryId;
        
        // Update tabs
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        if (tabElement) {
            tabElement.classList.add('active');
        } else {
            document.querySelector(`[data-category="${categoryId}"]`)?.classList.add('active');
        }
        
        // Filter products
        this.renderProducts();
    }
    
    // ============ PRODUCTS ============
    loadProductsRealtime() {
        this.productsUnsubscribe = BashanPOS.getProductsRealtime((products) => {
            this.products = products;
            this.renderProducts();
            this.checkLowStock();
        });
    }
    
    renderProducts(searchTerm = '') {
        const grid = document.getElementById('productsGrid');
        let filtered = [...this.products];
        
        // Filter by category
        if (this.selectedCategory !== 'all') {
            filtered = filtered.filter(p => p.category === this.selectedCategory);
        }
        
        // Filter by search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(term) ||
                (p.barcode && p.barcode.includes(term))
            );
        }
        
        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="no-products">
                    <p>No products found</p>
                    <span>Try different search or category</span>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = filtered.map(product => this.createProductCard(product)).join('');
        
        // Add click handlers
        grid.querySelectorAll('.product-card:not(.sold-out)').forEach(card => {
            card.addEventListener('click', () => {
                const productId = card.dataset.productId;
                const product = this.products.find(p => p.id === productId);
                if (product) this.addToCart(product);
            });
        });
    }
    createProductCard(product) {
    const uom = product.uom || 'kg';
    const nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
    const threshold = product.lowStockThreshold || this.settings?.lowStockThreshold || 100;
    
    let currentStock = 0;
    let stockDisplay = '';
    let priceDisplay = '';
    let isSoldOut = false;
    let isLowStock = false;
    let stockPercentage = 0;
    let maxStock = 0;
    
    switch(uom) {
        case 'kg':
            currentStock = product.currentStockKg || 0;
            maxStock = nguniaSize * 5;
            stockDisplay = BashanPOS.formatStock(currentStock, nguniaSize);
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerKg || 0)}<small>/kg</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'bags':
            currentStock = product.currentStockCount || 0;
            maxStock = 50;
            stockDisplay = `${currentStock} bags (${(product.kgPerBag || 50)}kg each)`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerBag || 0)}<small>/bag</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'litres':
            currentStock = product.currentStockLitres || 0;
            maxStock = 100;
            stockDisplay = `${currentStock.toFixed(2)} L`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerLitre || 0)}<small>/L</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'ml':
            currentStock = product.currentStockMl || 0;
            maxStock = 5000;
            stockDisplay = `${currentStock.toFixed(0)} mL`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePer100ml || 0)}<small>/100mL</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'pieces':
            currentStock = product.currentStockCount || 0;
            maxStock = 100;
            stockDisplay = `${currentStock} pcs`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerPiece || 0)}<small>/pc</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'grams':
            currentStock = product.currentStockGrams || 0;
            maxStock = 5000;
            stockDisplay = `${currentStock}g`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerGram || 0)}<small>/g</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'sachets':
            currentStock = product.currentStockCount || 0;
            maxStock = 100;
            stockDisplay = `${currentStock} sachets`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerSachet || 0)}<small>/sachet</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'cartons':
            currentStock = product.currentStockCount || 0;
            maxStock = 20;
            const itemsPerCarton = product.itemsPerCarton || 12;
            stockDisplay = `${currentStock} cartons (${currentStock * itemsPerCarton} pcs)`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerCarton || 0)}<small>/carton</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'rolls':
            currentStock = product.currentStockCount || 0;
            maxStock = 30;
            stockDisplay = `${currentStock} rolls`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerRoll || 0)}<small>/roll</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        case 'metres':
            currentStock = product.currentStockMetres || 0;
            maxStock = 200;
            stockDisplay = `${currentStock.toFixed(2)} m`;
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerMetre || 0)}<small>/m</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
            break;
            
        default:
            currentStock = product.currentStockKg || 0;
            maxStock = nguniaSize * 5;
            stockDisplay = BashanPOS.formatStock(currentStock, nguniaSize);
            priceDisplay = `${BashanPOS.formatCurrency(product.pricePerKg || 0)}<small>/kg</small>`;
            isSoldOut = currentStock <= 0;
            isLowStock = currentStock <= threshold && currentStock > 0;
            stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
    }
    
    let stockBarClass = 'good';
    if (stockPercentage < 20) stockBarClass = 'low';
    else if (stockPercentage < 50) stockBarClass = 'medium';
    
    const uomBadge = uom !== 'kg' ? `<span class="uom-badge">${uom}</span>` : '';
    
    return `
        <div class="product-card ${isSoldOut ? 'sold-out' : ''} ${isLowStock && !isSoldOut ? 'low-stock' : ''}" 
             data-product-id="${product.id}">
            ${isLowStock && !isSoldOut ? '<span class="low-stock-badge">Low</span>' : ''}
            ${uomBadge}
            <div class="product-name">${product.name}</div>
            <div class="product-category">${product.category || 'Uncategorized'}</div>
            <div class="product-price">${priceDisplay}</div>
            <div class="product-stock">${stockDisplay}</div>
            <div class="stock-bar">
                <div class="stock-bar-fill ${stockBarClass}" style="width: ${stockPercentage}%"></div>
            </div>
        </div>
    `;
}addToCart(product) {
    const uom = product.uom || 'kg';
    const existingIndex = this.cart.findIndex(item => item.productId === product.id);
    
    if (existingIndex >= 0) {
        const item = this.cart[existingIndex];
        let newQty = item.qty + 1;
        let currentStock = this.getProductStock(product);
        
        if (newQty > currentStock) {
            BashanPOS.showNotification('Not enough stock available!', 'warning');
            return;
        }
        
        item.qty = newQty;
        item.qtyKg = this.convertToKg(product, newQty);
        item.subtotal = this.calculateItemSubtotal(product, newQty);
    } else {
        let currentStock = this.getProductStock(product);
        
        if (currentStock <= 0) {
            BashanPOS.showNotification('Product is out of stock!', 'error');
            return;
        }
        
        const cartItem = {
            productId: product.id,
            name: product.name,
            uom: uom,
            qty: 1,
            maxStock: currentStock
        };
        
        // Add UOM-specific properties
        switch(uom) {
            case 'kg':
                cartItem.nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
                cartItem.pricePerKg = product.pricePerKg || 0;
                cartItem.qtyKg = this.convertToKg(product, 1);
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'bags':
                cartItem.kgPerBag = product.kgPerBag || 50;
                cartItem.pricePerBag = product.pricePerBag || 0;
                cartItem.qtyKg = this.convertToKg(product, 1);
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'litres':
                cartItem.pricePerLitre = product.pricePerLitre || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'ml':
                cartItem.pricePer100ml = product.pricePer100ml || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'pieces':
                cartItem.pricePerPiece = product.pricePerPiece || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'grams':
                cartItem.pricePerGram = product.pricePerGram || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'sachets':
                cartItem.pricePerSachet = product.pricePerSachet || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'cartons':
                cartItem.itemsPerCarton = product.itemsPerCarton || 12;
                cartItem.pricePerCarton = product.pricePerCarton || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'rolls':
                cartItem.pricePerRoll = product.pricePerRoll || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
            case 'metres':
                cartItem.pricePerMetre = product.pricePerMetre || 0;
                cartItem.subtotal = this.calculateItemSubtotal(product, 1);
                break;
        }
        
        this.cart.push(cartItem);
    }
    
    this.renderCart();
    this.updateCartSummary();
    this.saveCart();
    
    if (navigator.vibrate) {
        navigator.vibrate(20);
    }
}
    
    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
        this.updateCartSummary();
        this.saveCart();
    }
    
    updateCartItemQuantity(index, type, value) {
        const item = this.cart[index];
        const product = this.products.find(p => p.id === item.productId);
        if (!product) return;
        
        let newNgunia, newKg;
        
        if (type === 'ngunia') {
            newNgunia = parseFloat(value) || 0;
            newKg = newNgunia * item.nguniaSize;
        } else {
            newKg = parseFloat(value) || 0;
            newNgunia = newKg / item.nguniaSize;
        }
        
        // Validate
        if (newNgunia < 0) {
            BashanPOS.showNotification('Quantity cannot be negative', 'warning');
            this.renderCart();
            return;
        }
        
        if (newKg > product.currentStockKg) {
            BashanPOS.showNotification(`Only ${BashanPOS.formatStock(product.currentStockKg, item.nguniaSize)} available`, 'warning');
            newKg = product.currentStockKg;
            newNgunia = newKg / item.nguniaSize;
        }
        
        if (newNgunia === 0) {
            this.removeFromCart(index);
            return;
        }
        
        item.qtyNgunia = newNgunia;
        item.qtyKg = newKg;
        
        this.renderCart();
        this.updateCartSummary();
        this.saveCart();
    }renderCart() {
    const cartContainer = document.getElementById('cartItems');
    
    if (this.cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="cart-empty">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                <p>No items in basket</p>
                <span>Click products to add</span>
            </div>
        `;
        return;
    }
    
    cartContainer.innerHTML = this.cart.map((item, index) => {
        const qty = item.qty || 0;
        const subtotal = item.subtotal || 0;
        let qtyLabel = '';
        let unitLabel = '';
        
        switch(item.uom) {
            case 'kg':
                qtyLabel = `${qty.toFixed(3)} ngunias`;
                unitLabel = `1 ngunia = ${item.nguniaSize || 1000}kg`;
                break;
            case 'bags':
                qtyLabel = `${qty} bags`;
                unitLabel = `${item.kgPerBag || 50}kg per bag`;
                break;
            case 'litres':
                qtyLabel = `${qty.toFixed(2)} litres`;
                unitLabel = 'per litre';
                break;
            case 'ml':
                qtyLabel = `${qty.toFixed(0)} mL`;
                unitLabel = 'per 100mL';
                break;
            case 'pieces':
                qtyLabel = `${qty} pieces`;
                unitLabel = 'per piece';
                break;
            case 'grams':
                qtyLabel = `${qty}g`;
                unitLabel = 'per gram';
                break;
            case 'sachets':
                qtyLabel = `${qty} sachets`;
                unitLabel = 'per sachet';
                break;
            case 'cartons':
                qtyLabel = `${qty} cartons`;
                unitLabel = `${item.itemsPerCarton || 12} items/carton`;
                break;
            case 'rolls':
                qtyLabel = `${qty} rolls`;
                unitLabel = 'per roll';
                break;
            case 'metres':
                qtyLabel = `${qty.toFixed(2)} metres`;
                unitLabel = 'per metre';
                break;
            default:
                qtyLabel = `${qty} units`;
                unitLabel = '';
        }
        
        return `
        <div class="cart-item">
            <div class="cart-item-header">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-uom">${item.uom}</span>
                <button class="remove-item-btn" onclick="posSystem.removeFromCart(${index})" title="Remove">×</button>
            </div>
            <div class="cart-item-inputs">
                <div class="qty-input-group">
                    <div class="qty-label">Quantity</div>
                    <input type="number" 
                           class="qty-input" 
                           value="${qty}" 
                           step="${item.uom === 'kg' ? '0.001' : '1'}" 
                           min="0"
                           onchange="posSystem.updateCartItemQuantity(${index}, this.value)">
                    <div class="qty-unit">${unitLabel}</div>
                </div>
            </div>
            <div class="cart-item-subtotal">
                ${BashanPOS.formatCurrency(subtotal)}
            </div>
        </div>
        `;
    }).join('');
}


getProductStock(product) {
    const uom = product.uom || 'kg';
    switch(uom) {
        case 'kg': return product.currentStockKg || 0;
        case 'bags': return product.currentStockCount || 0;
        case 'litres': return product.currentStockLitres || 0;
        case 'ml': return product.currentStockMl || 0;
        case 'pieces': return product.currentStockCount || 0;
        case 'grams': return product.currentStockGrams || 0;
        case 'sachets': return product.currentStockCount || 0;
        case 'cartons': return product.currentStockCount || 0;
        case 'rolls': return product.currentStockCount || 0;
        case 'metres': return product.currentStockMetres || 0;
        default: return product.currentStockKg || 0;
    }
}

convertToKg(product, qty) {
    const uom = product.uom || 'kg';
    switch(uom) {
        case 'kg': return qty * (product.nguniaKg || 1000);
        case 'bags': return qty * (product.kgPerBag || 50);
        default: return qty; // Non-weight items
    }
}

calculateItemSubtotal(product, qty) {
    const uom = product.uom || 'kg';
    switch(uom) {
        case 'kg': return qty * (product.nguniaKg || 1000) * (product.pricePerKg || 0);
        case 'bags': return qty * (product.pricePerBag || 0);
        case 'litres': return qty * (product.pricePerLitre || 0);
        case 'ml': return qty * (product.pricePer100ml || 0);
        case 'pieces': return qty * (product.pricePerPiece || 0);
        case 'grams': return qty * (product.pricePerGram || 0);
        case 'sachets': return qty * (product.pricePerSachet || 0);
        case 'cartons': return qty * (product.pricePerCarton || 0);
        case 'rolls': return qty * (product.pricePerRoll || 0);
        case 'metres': return qty * (product.pricePerMetre || 0);
        default: return qty * (product.pricePerKg || 0);
    }
}

updateCartItemQuantity(index, value) {
    const item = this.cart[index];
    if (!item) return;
    
    const product = this.products.find(p => p.id === item.productId);
    if (!product) return;
    
    let newQty = parseFloat(value) || 0;
    const currentStock = this.getProductStock(product);
    
    if (newQty < 0) {
        BashanPOS.showNotification('Quantity cannot be negative', 'warning');
        this.renderCart();
        return;
    }
    
    if (newQty > currentStock) {
        BashanPOS.showNotification(`Only ${currentStock} available`, 'warning');
        newQty = currentStock;
    }
    
    if (newQty === 0) {
        this.removeFromCart(index);
        return;
    }
    
    item.qty = newQty;
    item.qtyKg = this.convertToKg(product, newQty);
    item.subtotal = this.calculateItemSubtotal(product, newQty);
    
    this.renderCart();
    this.updateCartSummary();
    this.saveCart();
}


    
    
    updateCartSummary() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.qtyKg * item.pricePerKg), 0);
        const discount = parseFloat(document.getElementById('discountInput').value) || 0;
        const total = Math.max(0, subtotal - discount);
        
        document.getElementById('cartSubtotal').textContent = BashanPOS.formatCurrency(subtotal);
        document.getElementById('cartTotal').textContent = BashanPOS.formatCurrency(total);
        
        // Enable/disable complete button
        const completeBtn = document.getElementById('completeSaleBtn');
        completeBtn.disabled = this.cart.length === 0 || total <= 0;
    }
    
    clearCart() {
        if (this.cart.length === 0) return;
        
        BashanPOS.showConfirm('Clear all items from basket?').then(confirmed => {
            if (confirmed) {
                this.cart = [];
                this.renderCart();
                this.updateCartSummary();
                this.saveCart();
                BashanPOS.showNotification('Basket cleared', 'info');
            }
        });
    }
    
    saveCart() {
        sessionStorage.setItem('bashan_cart', JSON.stringify(this.cart));
    }
    
    restoreCart() {
        const saved = sessionStorage.getItem('bashan_cart');
        if (saved) {
            try {
                this.cart = JSON.parse(saved);
                // Update max stock values
                this.cart.forEach(item => {
                    const product = this.products.find(p => p.id === item.productId);
                    if (product) {
                        item.maxStock = product.currentStockKg;
                        item.pricePerKg = product.pricePerKg;
                    }
                });
                this.renderCart();
                this.updateCartSummary();
            } catch (e) {
                this.cart = [];
            }
        }
    }
    
    // ============ COMPLETE SALE ============async completeSale() {
    if (this.cart.length === 0) {
        BashanPOS.showNotification('Basket is empty!', 'warning');
        return;
    }
    
    // Calculate totals
    const subtotal = this.cart.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const discount = parseFloat(document.getElementById('discountInput').value) || 0;
    const total = Math.max(0, subtotal - discount);
    
    if (total <= 0) {
        BashanPOS.showNotification('Total must be greater than 0', 'warning');
        return;
    }
    
    // Check discount limit
    if (this.settings?.maxDiscount && discount > this.settings.maxDiscount) {
        BashanPOS.showNotification(`Maximum discount allowed is ${BashanPOS.formatCurrency(this.settings.maxDiscount)}`, 'warning');
        return;
    }
    
    // Verify stock availability for all items
    for (const item of this.cart) {
        const product = this.products.find(p => p.id === item.productId);
        if (!product) {
            BashanPOS.showNotification(`Product not found: ${item.name}`, 'error');
            return;
        }
        
        const currentStock = this.getProductStock(product);
        if (item.qty > currentStock) {
            BashanPOS.showNotification(`Insufficient stock for ${item.name}. Only ${currentStock} available.`, 'error');
            return;
        }
    }
    
    // Confirm sale
    const confirmed = await BashanPOS.showConfirm(
        `Complete sale of ${BashanPOS.formatCurrency(total)}?\n\n` +
        `Items: ${this.cart.length}\n` +
        `Discount: ${BashanPOS.formatCurrency(discount)}`
    );
    
    if (!confirmed) return;
    
    // Process sale
    const paymentMethod = document.getElementById('paymentMethod').value;
    const customerName = document.getElementById('customerName').value.trim();
    
    // Prepare sale items with UOM info
    const saleItems = this.cart.map(item => {
        const saleItem = {
            productId: item.productId,
            name: item.name,
            uom: item.uom || 'kg',
            qty: item.qty,
            price: item.subtotal / (item.qty || 1),
            subtotal: item.subtotal
        };
        
        // Add UOM-specific details
        switch(item.uom) {
            case 'kg':
                saleItem.qtyNgunia = item.qty;
                saleItem.qtyKg = item.qtyKg;
                saleItem.pricePerKg = item.pricePerKg;
                saleItem.nguniaSize = item.nguniaSize;
                break;
            case 'bags':
                saleItem.pricePerBag = item.pricePerBag;
                saleItem.kgPerBag = item.kgPerBag;
                break;
            case 'litres':
                saleItem.pricePerLitre = item.pricePerLitre;
                break;
            case 'ml':
                saleItem.pricePer100ml = item.pricePer100ml;
                break;
            case 'pieces':
                saleItem.pricePerPiece = item.pricePerPiece;
                break;
            case 'grams':
                saleItem.pricePerGram = item.pricePerGram;
                break;
            case 'sachets':
                saleItem.pricePerSachet = item.pricePerSachet;
                break;
            case 'cartons':
                saleItem.pricePerCarton = item.pricePerCarton;
                saleItem.itemsPerCarton = item.itemsPerCarton;
                break;
            case 'rolls':
                saleItem.pricePerRoll = item.pricePerRoll;
                break;
            case 'metres':
                saleItem.pricePerMetre = item.pricePerMetre;
                break;
        }
        
        return saleItem;
    });
    
    const saleData = {
        items: saleItems,
        subtotal: subtotal,
        discountKsh: discount,
        total: total,
        paymentMethod: paymentMethod,
        customerName: customerName,
        sellerId: this.user.id,
        sellerName: this.user.name
    };
    
    // Show loading
    const completeBtn = document.getElementById('completeSaleBtn');
    completeBtn.disabled = true;
    completeBtn.innerHTML = '<div class="loading-spinner"></div>';
    
    const result = await BashanPOS.completeSale(saleData);
    
    if (result.success) {
        this.lastSale = {
            ...saleData,
            receiptNumber: result.receiptNumber,
            saleId: result.saleId,
            timestamp: new Date()
        };
        
        // Show success modal
        this.showSuccessModal();
        
        // Clear cart
        this.cart = [];
        this.renderCart();
        this.updateCartSummary();
        this.saveCart();
        document.getElementById('discountInput').value = '0';
        document.getElementById('customerName').value = '';
        
        // Refresh today's stats
        this.loadTodaySales();
        
        // Play success sound
        this.playSuccessSound();
        
        BashanPOS.showNotification(`Sale complete! Receipt: ${result.receiptNumber}`, 'success');
    } else {
        BashanPOS.showNotification('Sale failed: ' + result.message, 'error');
    }
    
    completeBtn.disabled = false;
    completeBtn.innerHTML = `
        <span>COMPLETE SALE</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
        </svg>
    `;
}
    showSuccessModal() {
        const sale = this.lastSale;
        if (!sale) return;
        
        document.getElementById('saleDetails').innerHTML = `
            <p><strong>Receipt:</strong> ${sale.receiptNumber}</p>
            <p><strong>Total:</strong> ${BashanPOS.formatCurrency(sale.total)}</p>
            <p><strong>Items:</strong> ${sale.items.length}</p>
            <p><strong>Payment:</strong> ${sale.paymentMethod}</p>
            ${sale.customerName ? `<p><strong>Customer:</strong> ${sale.customerName}</p>` : ''}
        `;
        
        document.getElementById('successModal').classList.add('active');
    }
    
    newSale() {
        document.getElementById('successModal').classList.remove('active');
        document.getElementById('searchProducts').focus();
    }
    
    playSuccessSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
            oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            
            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.3);
        } catch (e) {
            // Audio not supported
        }
    }
    
    // ============ RECEIPT ============
    generateReceiptHTML(sale = null) {
        if (!sale) sale = this.lastSale;
        if (!sale) return '';
        
        const settings = this.settings || {};
        const date = sale.timestamp ? new Date(sale.timestamp) : new Date();
        
        return `
            <div style="font-family: monospace; max-width: 300px; padding: 10px; font-size: 12px;">
                <div style="text-align: center; margin-bottom: 15px;">
                    <h2 style="margin: 0; font-size: 16px;">${settings.businessName || 'Bashan Livestock Feeds'}</h2>
                    <p style="margin: 5px 0; font-size: 11px;">${settings.businessAddress || ''}</p>
                    <p style="margin: 5px 0; font-size: 11px;">Tel: ${settings.businessPhone || ''}</p>
                    <hr style="border: 1px dashed #ccc;">
                </div>
                
                <p><strong>Receipt:</strong> ${sale.receiptNumber}</p>
                <p><strong>Date:</strong> ${date.toLocaleString('en-KE')}</p>
                <p><strong>Seller:</strong> ${sale.sellerName}</p>
                ${sale.customerName ? `<p><strong>Customer:</strong> ${sale.customerName}</p>` : ''}
                
                <hr style="border: 1px dashed #ccc;">
                
                <table style="width: 100%; font-size: 11px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #ccc;">
                            <th style="text-align: left;">Item</th>
                            <th style="text-align: right;">Qty</th>
                            <th style="text-align: right;">Price</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sale.items.map(item => `
                            <tr>
                                <td>${item.name}</td>
                                <td style="text-align: right;">${item.qtyKg.toFixed(1)}kg</td>
                                <td style="text-align: right;">${item.pricePerKg}</td>
                                <td style="text-align: right;">${BashanPOS.formatCurrency(item.subtotal)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <hr style="border: 1px dashed #ccc;">
                
                <p style="text-align: right;"><strong>Subtotal:</strong> ${BashanPOS.formatCurrency(sale.subtotal)}</p>
                <p style="text-align: right;"><strong>Discount:</strong> -${BashanPOS.formatCurrency(sale.discountKsh)}</p>
                <p style="text-align: right; font-size: 14px;"><strong>TOTAL:</strong> ${BashanPOS.formatCurrency(sale.total)}</p>
                
                <p style="margin-top: 10px;"><strong>Payment:</strong> ${sale.paymentMethod}</p>
                
                <hr style="border: 1px dashed #ccc;">
                
                <p style="text-align: center; font-size: 10px; margin-top: 15px;">
                    Thank you for your business!<br>
                    ${settings.receiptFooter || 'Quality Livestock Feeds'}
                </p>
            </div>
        `;
    }
    
    printReceipt() {
        const html = this.generateReceiptHTML();
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
    }
    
    downloadReceiptPDF() {
        const sale = this.lastSale;
        if (!sale) return;
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
        
        const settings = this.settings || {};
        let y = 10;
        
        doc.setFontSize(12);
        doc.text(settings.businessName || 'Bashan Livestock Feeds', 40, y, { align: 'center' });
        y += 7;
        
        doc.setFontSize(8);
        doc.text(`Receipt: ${sale.receiptNumber}`, 5, y);
        y += 4;
        doc.text(`Date: ${new Date(sale.timestamp || Date.now()).toLocaleString('en-KE')}`, 5, y);
        y += 4;
        doc.text(`Seller: ${sale.sellerName}`, 5, y);
        y += 6;
        
        // Items
        sale.items.forEach(item => {
            doc.text(`${item.name} (${item.qtyKg.toFixed(1)}kg)`, 5, y);
            doc.text(BashanPOS.formatCurrency(item.subtotal), 75, y, { align: 'right' });
            y += 4;
        });
        
        y += 3;
        doc.line(5, y, 75, y);
        y += 5;
        
        doc.text('Subtotal:', 5, y);
        doc.text(BashanPOS.formatCurrency(sale.subtotal), 75, y, { align: 'right' });
        y += 4;
        doc.text('Discount:', 5, y);
        doc.text(`-${BashanPOS.formatCurrency(sale.discountKsh)}`, 75, y, { align: 'right' });
        y += 4;
        doc.setFontSize(10);
        doc.text('TOTAL:', 5, y);
        doc.text(BashanPOS.formatCurrency(sale.total), 75, y, { align: 'right' });
        y += 6;
        doc.setFontSize(8);
        doc.text(`Payment: ${sale.paymentMethod}`, 5, y);
        y += 8;
        doc.text('Thank you for your business!', 40, y, { align: 'center' });
        
        doc.save(`Receipt_${sale.receiptNumber}.pdf`);
    }
    
    // ============ REPORTS ============
    openReports() {
        document.getElementById('reportsOverlay').classList.add('active');
        this.loadReport();
    }
    
    closeReports() {
        document.getElementById('reportsOverlay').classList.remove('active');
    }
    async loadReport() {
    const period = document.getElementById('reportPeriod').value;
    const payment = document.getElementById('reportPayment').value;
    
    let startDate, endDate;
    const now = new Date();
    
    // Set date range based on period
    switch (period) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            break;
        case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            break;
        case 'week':
            const dayOfWeek = now.getDay(); // 0 = Sunday
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            break;
        case 'custom':
            const startInput = document.getElementById('startDate').value;
            const endInput = document.getElementById('endDate').value;
            
            if (!startInput || !endInput) {
                BashanPOS.showNotification('Please select both start and end dates', 'warning');
                return;
            }
            
            startDate = new Date(startInput + 'T00:00:00');
            endDate = new Date(endInput + 'T23:59:59');
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    }
    
    console.log('📊 Loading report from', startDate, 'to', endDate);
    
    try {
        // Show loading state
        document.getElementById('reportRevenue').textContent = 'Loading...';
        document.getElementById('reportDiscounts').textContent = '...';
        document.getElementById('reportCount').textContent = '...';
        document.getElementById('reportAvg').textContent = '...';
        document.getElementById('reportTableBody').innerHTML = 
            '<tr class="no-data"><td colspan="8">Loading report...</td></tr>';
        
        // Query sales
        let query = BashanPOS.salesRef
            .where('timestamp', '>=', startDate)
            .where('timestamp', '<', endDate)
            .orderBy('timestamp', 'desc');
        
        // Apply payment filter if needed
        if (payment && payment !== 'all') {
            query = query.where('paymentMethod', '==', payment);
        }
        
        const snapshot = await query.get();
        
        console.log('📊 Found', snapshot.size, 'sales');
        
        const sales = [];
        snapshot.forEach(doc => {
            sales.push({ id: doc.id, ...doc.data() });
        });
        
        // Update summary cards
        const totalRevenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
        const totalDiscounts = sales.reduce((sum, s) => sum + (s.discountKsh || 0), 0);
        const avgSale = sales.length > 0 ? totalRevenue / sales.length : 0;
        
        document.getElementById('reportRevenue').textContent = BashanPOS.formatCurrency(totalRevenue);
        document.getElementById('reportDiscounts').textContent = BashanPOS.formatCurrency(totalDiscounts);
        document.getElementById('reportCount').textContent = sales.length;
        document.getElementById('reportAvg').textContent = BashanPOS.formatCurrency(avgSale);
        
        // Update table
        const tbody = document.getElementById('reportTableBody');
        
        if (sales.length === 0) {
            tbody.innerHTML = `
                <tr class="no-data">
                    <td colspan="8">
                        <div style="padding: 30px; text-align: center;">
                            <p style="font-size: 16px; color: var(--text-muted);">📊 No sales found for this period</p>
                            <p style="font-size: 12px; color: var(--text-muted);">
                                ${period === 'today' ? 'Try selecting a different period or complete a sale first.' : 'Try selecting a different period.'}
                            </p>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = sales.map(sale => {
                // Format the timestamp safely
                let dateStr = 'N/A';
                if (sale.timestamp) {
                    try {
                        const date = sale.timestamp.toDate ? sale.timestamp.toDate() : new Date(sale.timestamp);
                        dateStr = date.toLocaleDateString('en-KE', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    } catch (e) {
                        dateStr = 'Invalid date';
                    }
                }
                
                return `
                <tr>
                    <td><strong>${sale.receiptNumber || 'N/A'}</strong></td>
                    <td>${dateStr}</td>
                    <td>${(sale.items && sale.items.length) || 0} items</td>
                    <td>${BashanPOS.formatCurrency(sale.subtotal || 0)}</td>
                    <td>${BashanPOS.formatCurrency(sale.discountKsh || 0)}</td>
                    <td><strong>${BashanPOS.formatCurrency(sale.total || 0)}</strong></td>
                    <td><span class="payment-badge payment-${(sale.paymentMethod || 'cash').toLowerCase()}">${sale.paymentMethod || 'Cash'}</span></td>
                    <td>${sale.sellerName || 'Unknown'}</td>
                </tr>
                `;
            }).join('');
        }
        
        // Store for export
        this.currentReportData = sales;
        this.currentReportPeriod = { startDate, endDate, period, payment };
        
    } catch (error) {
        console.error('❌ Load report error:', error);
        
        // Show error in UI
        document.getElementById('reportRevenue').textContent = 'Error';
        document.getElementById('reportDiscounts').textContent = 'Error';
        document.getElementById('reportCount').textContent = 'Error';
        document.getElementById('reportAvg').textContent = 'Error';
        document.getElementById('reportTableBody').innerHTML = `
            <tr class="no-data">
                <td colspan="8">
                    <div style="padding: 30px; text-align: center;">
                        <p style="color: var(--danger);">❌ Failed to load report</p>
                        <p style="font-size: 12px; color: var(--text-muted);">${error.message}</p>
                        <p style="font-size: 11px; color: var(--text-muted);">
                            This may happen if you need to create a composite index in Firebase.
                            <br>Check the browser console (F12) for a link to create the required index.
                        </p>
                    </div>
                </td>
            </tr>
        `;
        
        BashanPOS.showNotification('Failed to load report. Check console for details.', 'error');
    }
}
    exportCSV() {
        if (!this.currentReportData || this.currentReportData.length === 0) {
            BashanPOS.showNotification('No data to export', 'warning');
            return;
        }
        
        let csv = 'Receipt,Date,Items,Subtotal,Discount,Total,Payment,Seller\n';
        
        this.currentReportData.forEach(sale => {
            csv += `"${sale.receiptNumber}","${BashanPOS.formatDate(sale.timestamp)}",` +
                   `${sale.items.length},${sale.subtotal},${sale.discountKsh || 0},` +
                   `${sale.total},"${sale.paymentMethod}","${sale.sellerName}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    exportPDF() {
        if (!this.currentReportData || this.currentReportData.length === 0) {
            BashanPOS.showNotification('No data to export', 'warning');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.text('Bashan Livestock Feeds - Sales Report', 20, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString('en-KE')}`, 20, 30);
        
        const headers = ['Receipt', 'Date', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment'];
        const data = this.currentReportData.map(sale => [
            sale.receiptNumber,
            BashanPOS.formatDate(sale.timestamp),
            `${sale.items.length} items`,
            BashanPOS.formatCurrency(sale.subtotal),
            BashanPOS.formatCurrency(sale.discountKsh || 0),
            BashanPOS.formatCurrency(sale.total),
            sale.paymentMethod
        ]);
        
        doc.autoTable({
            startY: 40,
            head: [headers],
            body: data,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [26, 86, 50] }
        });
        
        doc.save(`sales_report_${new Date().toISOString().split('T')[0]}.pdf`);
    }
    
    printReport() {
        window.print();
    }
    
    // ============ TODAY'S SALES ============
    async loadTodaySales() {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        
        try {
            const snapshot = await BashanPOS.salesRef
                .where('timestamp', '>=', startOfDay)
                .where('timestamp', '<', endOfDay)
                .get();
            
            let total = 0;
            snapshot.forEach(doc => {
                total += doc.data().total || 0;
            });
            
            this.todaySales = {
                total: total,
                count: snapshot.size
            };
            
            document.getElementById('todayTotal').textContent = BashanPOS.formatCurrency(total);
            document.getElementById('todayCount').textContent = snapshot.size;
            
        } catch (error) {
            console.error('Load today sales error:', error);
        }
    }
    
 checkLowStock() {
    const threshold = this.settings?.lowStockThreshold || 100;
    this.lowStockProducts = this.products.filter(p => {
        if (p.archived) return false;
        
        const uom = p.uom || 'kg';
        let stock = 0;
        let productThreshold = p.lowStockThreshold || threshold;
        
        switch(uom) {
            case 'kg': stock = p.currentStockKg || 0; break;
            case 'bags': stock = p.currentStockCount || 0; break;
            case 'litres': stock = p.currentStockLitres || 0; break;
            case 'ml': stock = p.currentStockMl || 0; break;
            case 'pieces': stock = p.currentStockCount || 0; break;
            case 'grams': stock = p.currentStockGrams || 0; break;
            case 'sachets': stock = p.currentStockCount || 0; break;
            case 'cartons': stock = p.currentStockCount || 0; break;
            case 'rolls': stock = p.currentStockCount || 0; break;
            case 'metres': stock = p.currentStockMetres || 0; break;
            default: stock = p.currentStockKg || 0;
        }
        
        return stock <= productThreshold && stock > 0;
    });
    
    const alertCount = document.getElementById('alertCount');
    const alertBell = document.getElementById('alertBell');
    
    if (this.lowStockProducts.length > 0) {
        alertCount.textContent = this.lowStockProducts.length;
        alertBell.classList.add('has-alerts');
    } else {
        alertCount.textContent = '';
        alertBell.classList.remove('has-alerts');
    }
}
    toggleStockAlerts() {
        const popup = document.getElementById('stockAlertPopup');
        
        if (popup.classList.contains('active')) {
            this.dismissStockAlerts();
            return;
        }
        
        if (this.lowStockProducts.length === 0) {
            BashanPOS.showNotification('No low stock alerts', 'info');
            return;
        }
        
        document.getElementById('alertBody').innerHTML = this.lowStockProducts.map(p => `
            <div class="alert-product">
                <span class="alert-product-name">${p.name}</span>
                <span class="alert-product-stock">${BashanPOS.formatStock(p.currentStockKg, p.nguniaKg || 1000)}</span>
            </div>
        `).join('');
        
        popup.classList.add('active');
        
        // Auto-dismiss after 10 seconds
        setTimeout(() => this.dismissStockAlerts(), 10000);
    }
    
    dismissStockAlerts() {
        document.getElementById('stockAlertPopup').classList.remove('active');
    }
    
    // ============ CLEANUP ============
    destroy() {
        if (this.productsUnsubscribe) this.productsUnsubscribe();
        if (this.salesUnsubscribe) this.salesUnsubscribe();
    }
}

// Initialize when DOM ready
let posSystem;
document.addEventListener('DOMContentLoaded', () => {
    posSystem = new BashanPOSSystem();
    window.posSystem = posSystem; // Global access
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (posSystem) posSystem.destroy();
});
