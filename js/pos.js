// ============================================
// BASHAAN POS - MAIN POS ENGINE (FULL REWRITE)
// ============================================

class BashanPOSSystem {
    constructor() {
        this.user = null;
        this.settings = null;
        this.products = [];
        this.categories = [];
        this.cart = [];
        this.selectedCategory = 'all';
        this.lowStockProducts = [];
        this.todaySales = { total: 0, count: 0 };
        this.lastSale = null;
        this.productsUnsubscribe = null;
        this.salesUnsubscribe = null;
        this.currentReportData = null;
        this.currentReportPeriod = null;
        
        this.init();
    }
    
    async init() {
        if (!window.BashanPOS) {
            console.error('❌ BashanPOS not loaded. Retrying...');
            setTimeout(() => this.init(), 500);
            return;
        }
        
        this.user = BashanPOS.checkAuth();
        if (!this.user) return;
        
        this.settings = await BashanPOS.getSettings();
        
        this.setupUI();
        this.setupClock();
        this.setupEventListeners();
        
        await this.loadCategories();
        this.loadProductsRealtime();
        this.loadTodaySales();
        
        this.restoreCart();
        this.checkLowStock();
        
        BashanPOS.logAudit('POS_OPEN', 'POS page loaded');
        console.log('🔥 POS System Ready');
    }
    
    // ============ UI SETUP ============
    setupUI() {
        const badgeName = document.querySelector('.badge-name');
        const badgeRole = document.querySelector('.badge-role');
        if (badgeName) badgeName.textContent = this.user.name;
        if (badgeRole) badgeRole.textContent = this.user.role;
        
        if (this.user.role === 'seller') {
            const reportsBtn = document.getElementById('reportsBtn');
            if (reportsBtn) reportsBtn.style.display = 'none';
        }
        
        if (this.user.role === 'manager') {
            const floatingMenu = document.getElementById('floatingMenu');
            if (floatingMenu) floatingMenu.style.display = 'block';
            
            const fabMain = document.getElementById('fabMain');
            if (fabMain) {
                fabMain.addEventListener('click', () => {
                    fabMain.classList.toggle('active');
                    const fabSubmenu = document.getElementById('fabSubmenu');
                    if (fabSubmenu) fabSubmenu.classList.toggle('open');
                });
            }
            
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.floating-menu')) {
                    const fm = document.getElementById('fabMain');
                    const fs = document.getElementById('fabSubmenu');
                    if (fm) fm.classList.remove('active');
                    if (fs) fs.classList.remove('open');
                }
            });
            
            const fabReports = document.getElementById('fabReports');
            if (fabReports) {
                fabReports.addEventListener('click', () => {
                    const fm = document.getElementById('fabMain');
                    const fs = document.getElementById('fabSubmenu');
                    if (fm) fm.classList.remove('active');
                    if (fs) fs.classList.remove('open');
                    this.openReports();
                });
            }
            
            const fabLogout = document.getElementById('fabLogout');
            if (fabLogout) {
                fabLogout.addEventListener('click', () => BashanPOS.logout());
            }
        }
    }
    
    setupClock() {
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-KE', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            });
            const dateStr = now.toLocaleDateString('en-KE', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            
            const clockEl = document.getElementById('liveClock');
            const dateEl = document.getElementById('dateDisplay');
            if (clockEl) clockEl.textContent = timeStr;
            if (dateEl) dateEl.textContent = dateStr;
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    }
    
    setupEventListeners() {
        const bind = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        };
        
        bind('searchProducts', 'input', (e) => this.filterProducts(e.target.value));
        bind('discountInput', 'input', () => this.updateCartSummary());
        bind('completeSaleBtn', 'click', () => this.completeSale());
        bind('clearCartBtn', 'click', () => this.clearCart());
        bind('reportsBtn', 'click', () => this.openReports());
        bind('closeReports', 'click', () => this.closeReports());
        bind('loadReportBtn', 'click', () => this.loadReport());
        bind('exportCSV', 'click', () => this.exportCSV());
        bind('exportPDF', 'click', () => this.exportPDF());
        bind('printReport', 'click', () => this.printReport());
        bind('printReceiptBtn', 'click', () => this.printReceipt());
        bind('downloadReceiptBtn', 'click', () => this.downloadReceiptPDF());
        bind('newSaleBtn', 'click', () => this.newSale());
        bind('logoutBtn', 'click', () => BashanPOS.logout('User logout'));
        bind('alertBell', 'click', () => this.toggleStockAlerts());
        bind('dismissAlert', 'click', () => this.dismissStockAlerts());
        
        const reportPeriod = document.getElementById('reportPeriod');
        if (reportPeriod) {
            reportPeriod.addEventListener('change', (e) => {
                const customDates = document.getElementById('customDates');
                if (customDates) customDates.style.display = e.target.value === 'custom' ? 'flex' : 'none';
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.completeSale();
            }
            if (e.key === 'Escape') {
                this.clearCart();
            }
        });
        
        const reportsOverlay = document.getElementById('reportsOverlay');
        if (reportsOverlay) {
            reportsOverlay.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) this.closeReports();
            });
        }
        
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) this.newSale();
            });
        }
        
        window.addEventListener('beforeunload', () => this.saveCart());
    }
    
    // ============ CATEGORIES ============
    async loadCategories() {
        try {
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            this.categories = [];
            const tabsContainer = document.getElementById('categoryTabs');
            if (!tabsContainer) return;
            
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
            
            const allTab = tabsContainer.querySelector('[data-category="all"]');
            if (allTab) {
                allTab.addEventListener('click', function() {
                    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    if (window.posSystem) window.posSystem.selectCategory('all');
                });
            }
        } catch (error) {
            console.error('Load categories error:', error);
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
        
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        if (tabElement) {
            tabElement.classList.add('active');
        } else {
            const tab = document.querySelector(`[data-category="${categoryId}"]`);
            if (tab) tab.classList.add('active');
        }
        
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
        if (!grid) return;
        
        let filtered = [...this.products];
        
        if (this.selectedCategory !== 'all') {
            filtered = filtered.filter(p => p.category === this.selectedCategory);
        }
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.name && p.name.toLowerCase().includes(term)
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
        let maxStock = 100;
        
        switch(uom) {
            case 'kg':
                currentStock = product.currentStockKg || 0;
                maxStock = nguniaSize * 5;
                stockDisplay = BashanPOS.formatStock(currentStock, nguniaSize);
                priceDisplay = BashanPOS.formatCurrency(product.pricePerKg || 0) + '/kg';
                break;
            case 'bags':
                currentStock = product.currentStockCount || 0;
                maxStock = 50;
                stockDisplay = currentStock + ' bags (' + (product.kgPerBag || 50) + 'kg each)';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerBag || 0) + '/bag';
                break;
            case 'litres':
                currentStock = product.currentStockLitres || 0;
                maxStock = 100;
                stockDisplay = currentStock.toFixed(2) + ' L';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerLitre || 0) + '/L';
                break;
            case 'ml':
                currentStock = product.currentStockMl || 0;
                maxStock = 5000;
                stockDisplay = currentStock.toFixed(0) + ' mL';
                priceDisplay = BashanPOS.formatCurrency(product.pricePer100ml || 0) + '/100mL';
                break;
            case 'pieces':
                currentStock = product.currentStockCount || 0;
                maxStock = 100;
                stockDisplay = currentStock + ' pcs';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerPiece || 0) + '/pc';
                break;
            case 'grams':
                currentStock = product.currentStockGrams || 0;
                maxStock = 5000;
                stockDisplay = currentStock + 'g';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerGram || 0) + '/g';
                break;
            case 'sachets':
                currentStock = product.currentStockCount || 0;
                maxStock = 100;
                stockDisplay = currentStock + ' sachets';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerSachet || 0) + '/sachet';
                break;
            case 'cartons':
                currentStock = product.currentStockCount || 0;
                maxStock = 20;
                const ipc = product.itemsPerCarton || 12;
                stockDisplay = currentStock + ' cartons (' + (currentStock * ipc) + ' pcs)';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerCarton || 0) + '/carton';
                break;
            case 'rolls':
                currentStock = product.currentStockCount || 0;
                maxStock = 30;
                stockDisplay = currentStock + ' rolls';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerRoll || 0) + '/roll';
                break;
            case 'metres':
                currentStock = product.currentStockMetres || 0;
                maxStock = 200;
                stockDisplay = currentStock.toFixed(2) + ' m';
                priceDisplay = BashanPOS.formatCurrency(product.pricePerMetre || 0) + '/m';
                break;
            default:
                currentStock = product.currentStockKg || 0;
                maxStock = nguniaSize * 5;
                stockDisplay = BashanPOS.formatStock(currentStock, nguniaSize);
                priceDisplay = BashanPOS.formatCurrency(product.pricePerKg || 0) + '/kg';
        }
        
        isSoldOut = currentStock <= 0;
        isLowStock = currentStock <= threshold && currentStock > 0;
        stockPercentage = Math.min(100, Math.max(0, (currentStock / maxStock) * 100));
        
        let stockBarClass = 'good';
        if (stockPercentage < 20) stockBarClass = 'low';
        else if (stockPercentage < 50) stockBarClass = 'medium';
        
        const uomBadge = uom !== 'kg' ? '<span class="uom-badge">' + uom + '</span>' : '';
        
        return `
            <div class="product-card ${isSoldOut ? 'sold-out' : ''} ${isLowStock && !isSoldOut ? 'low-stock' : ''}" 
                 data-product-id="${product.id}">
                ${isLowStock && !isSoldOut ? '<span class="low-stock-badge">Low</span>' : ''}
                ${uomBadge}
                <div class="product-name">${product.name || 'Unnamed'}</div>
                <div class="product-category">${product.category || 'Uncategorized'}</div>
                <div class="product-price">${priceDisplay}</div>
                <div class="product-stock">${stockDisplay}</div>
                <div class="stock-bar">
                    <div class="stock-bar-fill ${stockBarClass}" style="width: ${stockPercentage}%"></div>
                </div>
            </div>
        `;
    }
    
    filterProducts(searchTerm) {
        this.renderProducts(searchTerm);
    }
    
    // ============ HELPER METHODS ============
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
            default: return qty;
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
    
    // ============ CART ============
    addToCart(product) {
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
                qtyKg: this.convertToKg(product, 1),
                subtotal: this.calculateItemSubtotal(product, 1),
                maxStock: currentStock
            };
            
            switch(uom) {
                case 'kg':
                    cartItem.nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
                    cartItem.pricePerKg = product.pricePerKg || 0;
                    break;
                case 'bags':
                    cartItem.kgPerBag = product.kgPerBag || 50;
                    cartItem.pricePerBag = product.pricePerBag || 0;
                    break;
                case 'litres': cartItem.pricePerLitre = product.pricePerLitre || 0; break;
                case 'ml': cartItem.pricePer100ml = product.pricePer100ml || 0; break;
                case 'pieces': cartItem.pricePerPiece = product.pricePerPiece || 0; break;
                case 'grams': cartItem.pricePerGram = product.pricePerGram || 0; break;
                case 'sachets': cartItem.pricePerSachet = product.pricePerSachet || 0; break;
                case 'cartons':
                    cartItem.itemsPerCarton = product.itemsPerCarton || 12;
                    cartItem.pricePerCarton = product.pricePerCarton || 0;
                    break;
                case 'rolls': cartItem.pricePerRoll = product.pricePerRoll || 0; break;
                case 'metres': cartItem.pricePerMetre = product.pricePerMetre || 0; break;
            }
            
            this.cart.push(cartItem);
        }
        
        this.renderCart();
        this.updateCartSummary();
        this.saveCart();
        
        if (navigator.vibrate) navigator.vibrate(20);
    }
    
    removeFromCart(index) {
        this.cart.splice(index, 1);
        this.renderCart();
        this.updateCartSummary();
        this.saveCart();
    }
    
    updateCartQuantity(index, value) {
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
            BashanPOS.showNotification('Only ' + currentStock + ' available', 'warning');
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
    
    renderCart() {
        const cartContainer = document.getElementById('cartItems');
        if (!cartContainer) return;
        
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
                    qtyLabel = qty.toFixed(3) + ' ngunias';
                    unitLabel = '1 ngunia = ' + (item.nguniaSize || 1000) + 'kg';
                    break;
                case 'bags':
                    qtyLabel = qty + ' bags';
                    unitLabel = (item.kgPerBag || 50) + 'kg per bag';
                    break;
                case 'litres':
                    qtyLabel = qty.toFixed(2) + ' litres';
                    unitLabel = 'per litre';
                    break;
                case 'ml':
                    qtyLabel = qty.toFixed(0) + ' mL';
                    unitLabel = 'per 100mL';
                    break;
                case 'pieces':
                    qtyLabel = qty + ' pieces';
                    unitLabel = 'per piece';
                    break;
                case 'grams':
                    qtyLabel = qty + 'g';
                    unitLabel = 'per gram';
                    break;
                case 'sachets':
                    qtyLabel = qty + ' sachets';
                    unitLabel = 'per sachet';
                    break;
                case 'cartons':
                    qtyLabel = qty + ' cartons';
                    unitLabel = (item.itemsPerCarton || 12) + ' items/carton';
                    break;
                case 'rolls':
                    qtyLabel = qty + ' rolls';
                    unitLabel = 'per roll';
                    break;
                case 'metres':
                    qtyLabel = qty.toFixed(2) + ' metres';
                    unitLabel = 'per metre';
                    break;
                default:
                    qtyLabel = qty + ' units';
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
                               onchange="posSystem.updateCartQuantity(${index}, this.value)">
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
    
    updateCartSummary() {
        const subtotal = this.cart.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
        const total = Math.max(0, subtotal - discount);
        
        const subEl = document.getElementById('cartSubtotal');
        const totalEl = document.getElementById('cartTotal');
        const completeBtn = document.getElementById('completeSaleBtn');
        
        if (subEl) subEl.textContent = BashanPOS.formatCurrency(subtotal);
        if (totalEl) totalEl.textContent = BashanPOS.formatCurrency(total);
        if (completeBtn) completeBtn.disabled = this.cart.length === 0 || total <= 0;
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
                this.cart.forEach(item => {
                    const product = this.products.find(p => p.id === item.productId);
                    if (product) {
                        item.maxStock = this.getProductStock(product);
                        item.subtotal = this.calculateItemSubtotal(product, item.qty || 1);
                    }
                });
                this.renderCart();
                this.updateCartSummary();
            } catch (e) {
                console.error('Restore cart error:', e);
                this.cart = [];
            }
        }
    }
    
    // ============ COMPLETE SALE ============
    async completeSale() {
        if (this.cart.length === 0) {
            BashanPOS.showNotification('Basket is empty!', 'warning');
            return;
        }
        
        const subtotal = this.cart.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
        const total = Math.max(0, subtotal - discount);
        
        if (total <= 0) {
            BashanPOS.showNotification('Total must be greater than 0', 'warning');
            return;
        }
        
        if (this.settings?.maxDiscount && discount > this.settings.maxDiscount) {
            BashanPOS.showNotification('Maximum discount is ' + BashanPOS.formatCurrency(this.settings.maxDiscount), 'warning');
            return;
        }
        
        for (const item of this.cart) {
            const product = this.products.find(p => p.id === item.productId);
            if (!product) {
                BashanPOS.showNotification('Product not found: ' + item.name, 'error');
                return;
            }
            const currentStock = this.getProductStock(product);
            if (item.qty > currentStock) {
                BashanPOS.showNotification('Insufficient stock for ' + item.name, 'error');
                return;
            }
        }
        
        const confirmed = await BashanPOS.showConfirm(
            'Complete sale of ' + BashanPOS.formatCurrency(total) + '?\n\nItems: ' + this.cart.length + '\nDiscount: ' + BashanPOS.formatCurrency(discount)
        );
        
        if (!confirmed) return;
        
        const paymentMethod = document.getElementById('paymentMethod')?.value || 'Cash';
        const customerName = document.getElementById('customerName')?.value?.trim() || '';
        
        const saleItems = this.cart.map(item => {
            const si = {
                productId: item.productId,
                name: item.name,
                uom: item.uom || 'kg',
                qty: item.qty,
                price: item.subtotal / (item.qty || 1),
                subtotal: item.subtotal
            };
            
            switch(item.uom) {
                case 'kg':
                    si.qtyNgunia = item.qty;
                    si.qtyKg = item.qtyKg;
                    si.pricePerKg = item.pricePerKg;
                    si.nguniaSize = item.nguniaSize;
                    break;
                case 'bags':
                    si.pricePerBag = item.pricePerBag;
                    si.kgPerBag = item.kgPerBag;
                    break;
                case 'litres': si.pricePerLitre = item.pricePerLitre; break;
                case 'ml': si.pricePer100ml = item.pricePer100ml; break;
                case 'pieces': si.pricePerPiece = item.pricePerPiece; break;
                case 'grams': si.pricePerGram = item.pricePerGram; break;
                case 'sachets': si.pricePerSachet = item.pricePerSachet; break;
                case 'cartons':
                    si.pricePerCarton = item.pricePerCarton;
                    si.itemsPerCarton = item.itemsPerCarton;
                    break;
                case 'rolls': si.pricePerRoll = item.pricePerRoll; break;
                case 'metres': si.pricePerMetre = item.pricePerMetre; break;
            }
            
            return si;
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
        
        const completeBtn = document.getElementById('completeSaleBtn');
        if (completeBtn) {
            completeBtn.disabled = true;
            completeBtn.innerHTML = '<div class="loading-spinner"></div>';
        }
        
        const result = await BashanPOS.completeSale(saleData);
        
        if (result.success) {
            this.lastSale = {
                ...saleData,
                receiptNumber: result.receiptNumber,
                saleId: result.saleId,
                timestamp: new Date()
            };
            
            this.showSuccessModal();
            
            this.cart = [];
            this.renderCart();
            this.updateCartSummary();
            this.saveCart();
            
            const discountInput = document.getElementById('discountInput');
            const customerNameInput = document.getElementById('customerName');
            if (discountInput) discountInput.value = '0';
            if (customerNameInput) customerNameInput.value = '';
            
            this.loadTodaySales();
            this.playSuccessSound();
            
            BashanPOS.showNotification('Sale complete! Receipt: ' + result.receiptNumber, 'success');
        } else {
            BashanPOS.showNotification('Sale failed: ' + result.message, 'error');
        }
        
        if (completeBtn) {
            completeBtn.disabled = false;
            completeBtn.innerHTML = '<span>COMPLETE SALE</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        }
    }
    
    showSuccessModal() {
        const sale = this.lastSale;
        if (!sale) return;
        
        const itemsList = sale.items.map(item => {
            let qtyDisplay = '';
            switch(item.uom) {
                case 'kg': qtyDisplay = (item.qtyKg || 0).toFixed(1) + 'kg'; break;
                case 'bags': qtyDisplay = item.qty + ' bags'; break;
                case 'litres': qtyDisplay = item.qty.toFixed(2) + ' L'; break;
                case 'ml': qtyDisplay = item.qty.toFixed(0) + ' mL'; break;
                case 'pieces': qtyDisplay = item.qty + ' pcs'; break;
                case 'grams': qtyDisplay = item.qty + 'g'; break;
                case 'sachets': qtyDisplay = item.qty + ' sachets'; break;
                case 'cartons': qtyDisplay = item.qty + ' cartons'; break;
                case 'rolls': qtyDisplay = item.qty + ' rolls'; break;
                case 'metres': qtyDisplay = item.qty.toFixed(2) + ' m'; break;
                default: qtyDisplay = item.qty;
            }
            return item.name + ': ' + qtyDisplay + ' - ' + BashanPOS.formatCurrency(item.subtotal);
        }).join('<br>');
        
        const saleDetails = document.getElementById('saleDetails');
        if (saleDetails) {
            saleDetails.innerHTML = `
                <p><strong>Receipt:</strong> ${sale.receiptNumber}</p>
                <p><strong>Total:</strong> ${BashanPOS.formatCurrency(sale.total)}</p>
                <p><strong>Items:</strong> ${sale.items.length}</p>
                <p><strong>Payment:</strong> ${sale.paymentMethod}</p>
                ${sale.customerName ? '<p><strong>Customer:</strong> ' + sale.customerName + '</p>' : ''}
                <div style="margin-top:10px;font-size:12px;text-align:left;border-top:1px solid var(--card-border);padding-top:10px;">${itemsList}</div>
            `;
        }
        
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.add('active');
    }
    
    newSale() {
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.remove('active');
        const searchInput = document.getElementById('searchProducts');
        if (searchInput) searchInput.focus();
    }
    
    playSuccessSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.setValueAtTime(1000, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.3);
        } catch (e) {}
    }
    
    // ============ RECEIPT ============
    generateReceiptHTML(sale) {
        if (!sale) sale = this.lastSale;
        if (!sale) return '';
        
        const settings = this.settings || {};
        const date = sale.timestamp ? new Date(sale.timestamp) : new Date();
        
        return `
            <div style="font-family:monospace;max-width:300px;padding:10px;font-size:12px;">
                <div style="text-align:center;margin-bottom:15px;">
                    <h2 style="margin:0;font-size:16px;">${settings.businessName || 'Bashan Livestock Feeds'}</h2>
                    <p style="margin:5px 0;font-size:11px;">${settings.businessAddress || ''}</p>
                    <p style="margin:5px 0;font-size:11px;">Tel: ${settings.businessPhone || ''}</p>
                    <hr style="border:1px dashed #ccc;">
                </div>
                <p><strong>Receipt:</strong> ${sale.receiptNumber}</p>
                <p><strong>Date:</strong> ${date.toLocaleString('en-KE')}</p>
                <p><strong>Seller:</strong> ${sale.sellerName}</p>
                ${sale.customerName ? '<p><strong>Customer:</strong> ' + sale.customerName + '</p>' : ''}
                <hr style="border:1px dashed #ccc;">
                <table style="width:100%;font-size:11px;">
                    <thead><tr style="border-bottom:1px solid #ccc;"><th style="text-align:left;">Item</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Total</th></tr></thead>
                    <tbody>
                        ${sale.items.map(item => {
                            let qtyD = '', priceD = '';
                            switch(item.uom) {
                                case 'kg': qtyD = (item.qtyKg||0).toFixed(1)+'kg'; priceD = item.pricePerKg||''; break;
                                case 'bags': qtyD = item.qty+' bags'; priceD = item.pricePerBag||''; break;
                                case 'litres': qtyD = (item.qty||0).toFixed(2)+' L'; priceD = item.pricePerLitre||''; break;
                                case 'ml': qtyD = (item.qty||0).toFixed(0)+' mL'; priceD = item.pricePer100ml||''; break;
                                case 'pieces': qtyD = item.qty+' pcs'; priceD = item.pricePerPiece||''; break;
                                case 'grams': qtyD = item.qty+'g'; priceD = item.pricePerGram||''; break;
                                case 'sachets': qtyD = item.qty+' sachets'; priceD = item.pricePerSachet||''; break;
                                case 'cartons': qtyD = item.qty+' cartons'; priceD = item.pricePerCarton||''; break;
                                case 'rolls': qtyD = item.qty+' rolls'; priceD = item.pricePerRoll||''; break;
                                case 'metres': qtyD = (item.qty||0).toFixed(2)+' m'; priceD = item.pricePerMetre||''; break;
                                default: qtyD = item.qty||''; priceD = '';
                            }
                            return '<tr><td>'+item.name+'</td><td style="text-align:right;">'+qtyD+'</td><td style="text-align:right;">'+priceD+'</td><td style="text-align:right;">'+BashanPOS.formatCurrency(item.subtotal)+'</td></tr>';
                        }).join('')}
                    </tbody>
                </table>
                <hr style="border:1px dashed #ccc;">
                <p style="text-align:right;"><strong>Subtotal:</strong> ${BashanPOS.formatCurrency(sale.subtotal)}</p>
                ${sale.discountKsh > 0 ? '<p style="text-align:right;"><strong>Discount:</strong> -'+BashanPOS.formatCurrency(sale.discountKsh)+'</p>' : ''}
                <p style="text-align:right;font-size:14px;"><strong>TOTAL:</strong> ${BashanPOS.formatCurrency(sale.total)}</p>
                <p style="margin-top:10px;"><strong>Payment:</strong> ${sale.paymentMethod}</p>
                <hr style="border:1px dashed #ccc;">
                <p style="text-align:center;font-size:10px;margin-top:15px;">Thank you for your business!<br>${settings.receiptFooter || 'Quality Products'}</p>
            </div>
        `;
    }
    
    printReceipt() {
        const html = this.generateReceiptHTML();
        const pw = window.open('', '_blank', 'width=400,height=600');
        pw.document.write(html);
        pw.document.close();
        pw.focus();
        setTimeout(() => pw.print(), 500);
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
        doc.text('Receipt: ' + sale.receiptNumber, 5, y); y += 4;
        doc.text('Date: ' + new Date(sale.timestamp || Date.now()).toLocaleString('en-KE'), 5, y); y += 4;
        doc.text('Seller: ' + sale.sellerName, 5, y); y += 6;
        
        sale.items.forEach(item => {
            let qtyD = '';
            switch(item.uom) {
                case 'kg': qtyD = (item.qtyKg||0).toFixed(1)+'kg'; break;
                case 'bags': qtyD = item.qty+' bags'; break;
                case 'litres': qtyD = (item.qty||0).toFixed(2)+' L'; break;
                case 'ml': qtyD = (item.qty||0).toFixed(0)+' mL'; break;
                case 'pieces': qtyD = item.qty+' pcs'; break;
                case 'grams': qtyD = item.qty+'g'; break;
                case 'sachets': qtyD = item.qty+' sachets'; break;
                case 'cartons': qtyD = item.qty+' cartons'; break;
                case 'rolls': qtyD = item.qty+' rolls'; break;
                case 'metres': qtyD = (item.qty||0).toFixed(2)+' m'; break;
                default: qtyD = item.qty;
            }
            doc.text(item.name + ' (' + qtyD + ')', 5, y);
            doc.text(BashanPOS.formatCurrency(item.subtotal), 75, y, { align: 'right' });
            y += 4;
        });
        
        y += 3; doc.line(5, y, 75, y); y += 5;
        doc.text('Subtotal:', 5, y); doc.text(BashanPOS.formatCurrency(sale.subtotal), 75, y, { align: 'right' }); y += 4;
        doc.text('Discount:', 5, y); doc.text('-' + BashanPOS.formatCurrency(sale.discountKsh), 75, y, { align: 'right' }); y += 4;
        doc.setFontSize(10);
        doc.text('TOTAL:', 5, y); doc.text(BashanPOS.formatCurrency(sale.total), 75, y, { align: 'right' }); y += 6;
        doc.setFontSize(8);
        doc.text('Payment: ' + sale.paymentMethod, 5, y); y += 8;
        doc.text('Thank you for your business!', 40, y, { align: 'center' });
        
        doc.save('Receipt_' + sale.receiptNumber + '.pdf');
    }
    
    // ============ REPORTS ============
    openReports() {
        const overlay = document.getElementById('reportsOverlay');
        if (overlay) overlay.classList.add('active');
        this.loadReport();
    }
    
    closeReports() {
        const overlay = document.getElementById('reportsOverlay');
        if (overlay) overlay.classList.remove('active');
    }
    
    async loadReport() {
        const period = document.getElementById('reportPeriod')?.value || 'today';
        const payment = document.getElementById('reportPayment')?.value || 'all';
        
        let startDate, endDate;
        const now = new Date();
        
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
                const dow = now.getDay();
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
                break;
            case 'custom':
                const si = document.getElementById('startDate')?.value;
                const ei = document.getElementById('endDate')?.value;
                if (!si || !ei) {
                    BashanPOS.showNotification('Please select both dates', 'warning');
                    return;
                }
                startDate = new Date(si + 'T00:00:00');
                endDate = new Date(ei + 'T23:59:59');
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        }
        
        try {
            const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
            setText('reportRevenue', 'Loading...');
            setText('reportDiscounts', '...');
            setText('reportCount', '...');
            setText('reportAvg', '...');
            
            const tbody = document.getElementById('reportTableBody');
            if (tbody) tbody.innerHTML = '<tr class="no-data"><td colspan="8">Loading report...</td></tr>';
            
            let query = BashanPOS.salesRef.where('timestamp', '>=', startDate).where('timestamp', '<', endDate).orderBy('timestamp', 'desc');
            if (payment && payment !== 'all') query = query.where('paymentMethod', '==', payment);
            
            const snapshot = await query.get();
            const sales = [];
            snapshot.forEach(doc => sales.push({ id: doc.id, ...doc.data() }));
            
            const totalRevenue = sales.reduce((s, x) => s + (x.total || 0), 0);
            const totalDiscounts = sales.reduce((s, x) => s + (x.discountKsh || 0), 0);
            const avgSale = sales.length > 0 ? totalRevenue / sales.length : 0;
            
            setText('reportRevenue', BashanPOS.formatCurrency(totalRevenue));
            setText('reportDiscounts', BashanPOS.formatCurrency(totalDiscounts));
            setText('reportCount', sales.length);
            setText('reportAvg', BashanPOS.formatCurrency(avgSale));
            
            if (tbody) {
                if (sales.length === 0) {
                    tbody.innerHTML = '<tr class="no-data"><td colspan="8"><div style="padding:30px;text-align:center;"><p>📊 No sales found</p></div></td></tr>';
                } else {
                    tbody.innerHTML = sales.map(sale => {
                        let ds = 'N/A';
                        if (sale.timestamp) {
                            try { ds = (sale.timestamp.toDate ? sale.timestamp.toDate() : new Date(sale.timestamp)).toLocaleDateString('en-KE', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); } catch(e) {}
                        }
                        return '<tr><td><strong>'+(sale.receiptNumber||'N/A')+'</strong></td><td>'+ds+'</td><td>'+(sale.items?.length||0)+' items</td><td>'+BashanPOS.formatCurrency(sale.subtotal||0)+'</td><td>'+BashanPOS.formatCurrency(sale.discountKsh||0)+'</td><td><strong>'+BashanPOS.formatCurrency(sale.total||0)+'</strong></td><td>'+ (sale.paymentMethod||'Cash')+'</td><td>'+(sale.sellerName||'')+'</td></tr>';
                    }).join('');
                }
            }
            
            this.currentReportData = sales;
            this.currentReportPeriod = { startDate, endDate, period, payment };
        } catch (error) {
            console.error('Report error:', error);
            const tbody = document.getElementById('reportTableBody');
            if (tbody) tbody.innerHTML = '<tr class="no-data"><td colspan="8"><div style="padding:30px;text-align:center;color:var(--danger);">❌ Failed to load report<br>'+error.message+'</div></td></tr>';
            BashanPOS.showNotification('Failed to load report', 'error');
        }
    }
    
    exportCSV() {
        if (!this.currentReportData?.length) { BashanPOS.showNotification('No data', 'warning'); return; }
        let csv = 'Receipt,Date,Items,Subtotal,Discount,Total,Payment,Seller\n';
        this.currentReportData.forEach(s => {
            csv += '"'+s.receiptNumber+'","'+BashanPOS.formatDate(s.timestamp)+'",'+s.items.length+','+s.subtotal+','+(s.discountKsh||0)+','+s.total+',"'+s.paymentMethod+'","'+s.sellerName+'"\n';
        });
        const b = new Blob([csv], {type:'text/csv'});
        const u = URL.createObjectURL(b);
        const a = document.createElement('a'); a.href = u; a.download = 'sales_report_'+new Date().toISOString().split('T')[0]+'.csv'; a.click();
        URL.revokeObjectURL(u);
    }
    
    exportPDF() {
        if (!this.currentReportData?.length) { BashanPOS.showNotification('No data', 'warning'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(16); doc.text('Sales Report', 20, 20);
        doc.setFontSize(10); doc.text('Generated: '+new Date().toLocaleString('en-KE'), 20, 30);
        doc.autoTable({
            startY: 40,
            head: [['Receipt','Date','Items','Subtotal','Discount','Total','Payment']],
            body: this.currentReportData.map(s => [s.receiptNumber, BashanPOS.formatDate(s.timestamp), s.items.length+' items', BashanPOS.formatCurrency(s.subtotal), BashanPOS.formatCurrency(s.discountKsh||0), BashanPOS.formatCurrency(s.total), s.paymentMethod]),
            theme: 'grid', styles: {fontSize:8}, headStyles: {fillColor:[26,86,50]}
        });
        doc.save('sales_report_'+new Date().toISOString().split('T')[0]+'.pdf');
    }
    
    printReport() { window.print(); }
    
    // ============ TODAY'S SALES ============
    async loadTodaySales() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        
        try {
            const snapshot = await BashanPOS.salesRef.where('timestamp', '>=', start).where('timestamp', '<', end).get();
            let total = 0;
            snapshot.forEach(doc => total += doc.data().total || 0);
            this.todaySales = { total, count: snapshot.size };
            
            const tt = document.getElementById('todayTotal');
            const tc = document.getElementById('todayCount');
            if (tt) tt.textContent = BashanPOS.formatCurrency(total);
            if (tc) tc.textContent = snapshot.size;
        } catch (e) { console.error('Today sales error:', e); }
    }
    
    // ============ LOW STOCK ============
    checkLowStock() {
        const threshold = this.settings?.lowStockThreshold || 100;
        this.lowStockProducts = this.products.filter(p => {
            if (p.archived) return false;
            const uom = p.uom || 'kg';
            let stock = 0;
            const pt = p.lowStockThreshold || threshold;
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
            return stock <= pt && stock > 0;
        });
        
        const ac = document.getElementById('alertCount');
        const ab = document.getElementById('alertBell');
        if (ac) ac.textContent = this.lowStockProducts.length || '';
        if (ab) {
            if (this.lowStockProducts.length > 0) ab.classList.add('has-alerts');
            else ab.classList.remove('has-alerts');
        }
    }
    
    toggleStockAlerts() {
        const popup = document.getElementById('stockAlertPopup');
        if (!popup) return;
        
        if (popup.classList.contains('active')) { this.dismissStockAlerts(); return; }
        if (this.lowStockProducts.length === 0) { BashanPOS.showNotification('No low stock alerts', 'info'); return; }
        
        const body = document.getElementById('alertBody');
        if (body) {
            body.innerHTML = this.lowStockProducts.map(p => {
                const uom = p.uom || 'kg';
                let sd = '';
                switch(uom) {
                    case 'kg': sd = BashanPOS.formatStock(p.currentStockKg||0, p.nguniaKg||1000); break;
                    case 'bags': sd = (p.currentStockCount||0)+' bags'; break;
                    case 'litres': sd = (p.currentStockLitres||0).toFixed(2)+' L'; break;
                    case 'pieces': sd = (p.currentStockCount||0)+' pcs'; break;
                    case 'sachets': sd = (p.currentStockCount||0)+' sachets'; break;
                    case 'cartons': sd = (p.currentStockCount||0)+' cartons'; break;
                    default: sd = (p.currentStockKg||0)+' kg';
                }
                return '<div class="alert-product"><span class="alert-product-name">'+p.name+'</span><span class="alert-product-stock">'+sd+'</span></div>';
            }).join('');
        }
        
        popup.classList.add('active');
        setTimeout(() => this.dismissStockAlerts(), 10000);
    }
    
    dismissStockAlerts() {
        const popup = document.getElementById('stockAlertPopup');
        if (popup) popup.classList.remove('active');
    }
    
    destroy() {
        if (this.productsUnsubscribe) this.productsUnsubscribe();
        if (this.salesUnsubscribe) this.salesUnsubscribe();
    }
}

// Initialize
let posSystem;
document.addEventListener('DOMContentLoaded', () => {
    posSystem = new BashanPOSSystem();
    window.posSystem = posSystem;
});

window.addEventListener('beforeunload', () => {
    if (posSystem) posSystem.destroy();
});
