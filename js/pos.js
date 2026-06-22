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
    }createProductCard(product) {
    // FIX: Ensure numeric values are valid
    const nguniaSize = (product.nguniaKg && !isNaN(product.nguniaKg)) ? product.nguniaKg : (this.settings?.nguniaDefault || 1000);
    const currentStock = (product.currentStockKg && !isNaN(product.currentStockKg)) ? product.currentStockKg : 0;
    const lowStockThreshold = (product.lowStockThreshold && !isNaN(product.lowStockThreshold)) ? product.lowStockThreshold : 100;
    const pricePerKg = (product.pricePerKg && !isNaN(product.pricePerKg)) ? product.pricePerKg : 0;
    
    const isLowStock = currentStock <= lowStockThreshold;
    const isSoldOut = currentStock <= 0;
    const stockPercentage = Math.min(100, Math.max(0, (currentStock / (nguniaSize * 5)) * 100));
    
    let stockBarClass = 'good';
    if (stockPercentage < 20) stockBarClass = 'low';
    else if (stockPercentage < 50) stockBarClass = 'medium';
    
    return `
        <div class="product-card ${isSoldOut ? 'sold-out' : ''} ${isLowStock && !isSoldOut ? 'low-stock' : ''}" 
             data-product-id="${product.id}">
            ${isLowStock && !isSoldOut ? '<span class="low-stock-badge">Low</span>' : ''}
            <div class="product-name">${product.name}</div>
            <div class="product-category">${product.category || 'Uncategorized'}</div>
            <div class="product-price">${BashanPOS.formatCurrency(pricePerKg)}<small>/kg</small></div>
            <div class="product-stock">${BashanPOS.formatStock(currentStock, nguniaSize)}</div>
            <div class="stock-bar">
                <div class="stock-bar-fill ${stockBarClass}" style="width: ${stockPercentage}%"></div>
            </div>
        </div>
    `;
}
    
    filterProducts(searchTerm) {
        this.renderProducts(searchTerm);
    }
    
    // ============ CART MANAGEMENT ============
    addToCart(product) {
        // Check if already in cart
        const existingIndex = this.cart.findIndex(item => item.productId === product.id);
        
        if (existingIndex >= 0) {
            // Increment quantity
            const item = this.cart[existingIndex];
            const nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
            const newNgunia = item.qtyNgunia + 1;
            const newKg = newNgunia * nguniaSize;
            
            if (newKg > product.currentStockKg) {
                BashanPOS.showNotification('Not enough stock available!', 'warning');
                return;
            }
            
            item.qtyNgunia = newNgunia;
            item.qtyKg = newKg;
        } else {
            // Add new item
            const nguniaSize = product.nguniaKg || this.settings?.nguniaDefault || 1000;
            
            if (product.currentStockKg <= 0) {
                BashanPOS.showNotification('Product is out of stock!', 'error');
                return;
            }
            
            this.cart.push({
                productId: product.id,
                name: product.name,
                pricePerKg: product.pricePerKg,
                nguniaSize: nguniaSize,
                qtyNgunia: 1,
                qtyKg: nguniaSize,
                maxStock: product.currentStockKg
            });
        }
        
        this.renderCart();
        this.updateCartSummary();
        this.saveCart();
        
        // Haptic feedback if available
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
    }
    renderCart() {
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
        // FIX: Ensure values are valid numbers
        const qtyNgunia = (item.qtyNgunia && !isNaN(item.qtyNgunia)) ? item.qtyNgunia : 0;
        const qtyKg = (item.qtyKg && !isNaN(item.qtyKg)) ? item.qtyKg : 0;
        const nguniaSize = (item.nguniaSize && !isNaN(item.nguniaSize)) ? item.nguniaSize : 1000;
        const pricePerKg = (item.pricePerKg && !isNaN(item.pricePerKg)) ? item.pricePerKg : 0;
        const subtotal = qtyKg * pricePerKg;
        
        return `
        <div class="cart-item">
            <div class="cart-item-header">
                <span class="cart-item-name">${item.name}</span>
                <button class="remove-item-btn" onclick="posSystem.removeFromCart(${index})" title="Remove">×</button>
            </div>
            <div class="cart-item-inputs">
                <div class="qty-input-group">
                    <div class="qty-label">Ngunias</div>
                    <input type="number" 
                           class="qty-input" 
                           value="${qtyNgunia.toFixed(3)}" 
                           step="0.001" 
                           min="0"
                           onchange="posSystem.updateCartItemQuantity(${index}, 'ngunia', this.value)">
                    <div class="qty-unit">1 ngunia = ${nguniaSize}kg</div>
                </div>
                <div class="qty-input-group">
                    <div class="qty-label">Kilograms</div>
                    <input type="number" 
                           class="qty-input" 
                           value="${qtyKg.toFixed(2)}" 
                           step="0.01" 
                           min="0"
                           onchange="posSystem.updateCartItemQuantity(${index}, 'kg', this.value)">
                    <div class="qty-unit">kg</div>
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
    
    // ============ COMPLETE SALE ============
    async completeSale() {
        if (this.cart.length === 0) {
            BashanPOS.showNotification('Basket is empty!', 'warning');
            return;
        }
        
        const subtotal = this.cart.reduce((sum, item) => sum + (item.qtyKg * item.pricePerKg), 0);
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
        
        // Verify stock availability
        for (const item of this.cart) {
            const product = this.products.find(p => p.id === item.productId);
            if (!product || product.currentStockKg < item.qtyKg) {
                BashanPOS.showNotification(`Insufficient stock for ${item.name}`, 'error');
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
        
        const saleData = {
            items: this.cart.map(item => ({
                productId: item.productId,
                name: item.name,
                qtyNgunia: item.qtyNgunia,
                qtyKg: item.qtyKg,
                pricePerKg: item.pricePerKg,
                subtotal: item.qtyKg * item.pricePerKg
            })),
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
        
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                break;
            case 'yesterday':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                const dayOfWeek = now.getDay();
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
                endDate = now;
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = now;
                break;
            case 'custom':
                startDate = new Date(document.getElementById('startDate').value);
                endDate = new Date(document.getElementById('endDate').value);
                endDate.setDate(endDate.getDate() + 1);
                break;
        }
        
        try {
            let query = BashanPOS.salesRef
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<', endDate)
                .orderBy('timestamp', 'desc');
            
            if (payment !== 'all') {
                query = query.where('paymentMethod', '==', payment);
            }
            
            const snapshot = await query.get();
            const sales = [];
            snapshot.forEach(doc => {
                sales.push({ id: doc.id, ...doc.data() });
            });
            
            // Update summary
            const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
            const totalDiscounts = sales.reduce((sum, s) => sum + (s.discountKsh || 0), 0);
            const avgSale = sales.length > 0 ? totalRevenue / sales.length : 0;
            
            document.getElementById('reportRevenue').textContent = BashanPOS.formatCurrency(totalRevenue);
            document.getElementById('reportDiscounts').textContent = BashanPOS.formatCurrency(totalDiscounts);
            document.getElementById('reportCount').textContent = sales.length;
            document.getElementById('reportAvg').textContent = BashanPOS.formatCurrency(avgSale);
            
            // Update table
            const tbody = document.getElementById('reportTableBody');
            
            if (sales.length === 0) {
                tbody.innerHTML = '<tr class="no-data"><td colspan="8">No sales found for this period</td></tr>';
            } else {
                tbody.innerHTML = sales.map(sale => `
                    <tr>
                        <td>${sale.receiptNumber}</td>
                        <td>${BashanPOS.formatDate(sale.timestamp)}</td>
                        <td>${sale.items.length} items</td>
                        <td>${BashanPOS.formatCurrency(sale.subtotal)}</td>
                        <td>${BashanPOS.formatCurrency(sale.discountKsh || 0)}</td>
                        <td><strong>${BashanPOS.formatCurrency(sale.total)}</strong></td>
                        <td>${sale.paymentMethod}</td>
                        <td>${sale.sellerName}</td>
                    </tr>
                `).join('');
            }
            
            // Store for export
            this.currentReportData = sales;
            this.currentReportPeriod = { startDate, endDate };
            
        } catch (error) {
            console.error('Load report error:', error);
            BashanPOS.showNotification('Failed to load report', 'error');
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
    
    // ============ LOW STOCK ALERTS ============
    checkLowStock() {
        const threshold = this.settings?.lowStockThreshold || 100;
        this.lowStockProducts = this.products.filter(p => 
            p.currentStockKg <= threshold && p.currentStockKg > 0 && !p.archived
        );
        
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
