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
        console.error('❌ BashanPOS not loaded. Retrying in 1 second...');
        setTimeout(() => this.init(), 1000);
        return;
    }
    
    this.user = BashanPOS.checkAuth();
    if (!this.user) return;
    
    // ... rest of your init code
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
        await this.loadCategories();
        await this.loadProducts();
        this.loadStats();
        
        BashanPOS.logAudit('INVENTORY_OPEN', 'Inventory page loaded');
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
    async loadCategories() {
        try {
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            this.categories = [];
            snapshot.forEach(doc => {
                this.categories.push({ id: doc.id, ...doc.data() });
            });
            
            this.populateCategoryDropdowns();
        } catch (error) {
            console.error('Load categories error:', error);
        }
    }
    
    populateCategoryDropdowns() {
        const filterSelect = document.getElementById('filterCategory');
        const productSelect = document.getElementById('productCategory');
        const historySelect = document.getElementById('historyProduct');
        
        // Clear existing options (keep first)
        filterSelect.innerHTML = '<option value="all">All Categories</option>';
        productSelect.innerHTML = '<option value="">Select category...</option>';
        
        this.categories.forEach(cat => {
            filterSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            productSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
        
        // Populate history product filter
        historySelect.innerHTML = '<option value="all">All Products</option>';
        this.products.forEach(p => {
            historySelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
    }
    
    // ============ PRODUCTS ============
    async loadProducts() {
        try {
            const snapshot = await BashanPOS.productsRef.where('archived', '==', false).get();
            this.products = [];
            snapshot.forEach(doc => {
                this.products.push({ id: doc.id, ...doc.data() });
            });
            
            this.renderTable();
            this.loadStats();
            this.populateCategoryDropdowns();
        } catch (error) {
            console.error('Load products error:', error);
            BashanPOS.showNotification('Failed to load products', 'error');
        }
    }
    
    getFilteredProducts() {
        const searchTerm = document.getElementById('searchInventory').value.toLowerCase();
        const categoryFilter = document.getElementById('filterCategory').value;
        const statusFilter = document.getElementById('filterStatus').value;
        
        return this.products.filter(product => {
            const matchesSearch = !searchTerm || product.name.toLowerCase().includes(searchTerm);
            const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
            
            let matchesStatus = true;
            if (statusFilter === 'in-stock') matchesStatus = product.currentStockKg > (product.lowStockThreshold || 100);
            else if (statusFilter === 'low-stock') matchesStatus = product.currentStockKg <= (product.lowStockThreshold || 100) && product.currentStockKg > 0;
            else if (statusFilter === 'out-of-stock') matchesStatus = product.currentStockKg <= 0;
            
            return matchesSearch && matchesCategory && matchesStatus;
        });
    }
    
    renderTable() {
        const filtered = this.getFilteredProducts();
        const tbody = document.getElementById('inventoryTableBody');
        
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">No products found</td></tr>';
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
        
        const stockPercentage = Math.min(100, (stock / (nguniaSize * 10)) * 100);
        const categoryName = this.categories.find(c => c.id === product.category)?.name || product.category || 'N/A';
        
        return `
            <tr class="${rowClass}" data-product-id="${product.id}">
                <td class="product-name-cell">${product.name}</td>
                <td>${categoryName}</td>
                <td>${nguniaSize} kg</td>
                <td class="stock-display">
                    ${BashanPOS.formatStock(stock, nguniaSize)}
                    <div class="stock-level-bar">
                        <div class="stock-level-fill ${stockBarClass}" style="width:${stockPercentage}%"></div>
                    </div>
                </td>
                <td>${BashanPOS.formatCurrency(product.pricePerKg)}/kg</td>
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
        const lowStock = this.products.filter(p => p.currentStockKg <= threshold && p.currentStockKg > 0).length;
        const outOfStock = this.products.filter(p => p.currentStockKg <= 0).length;
        const totalValue = this.products.reduce((sum, p) => sum + (p.currentStockKg * p.pricePerKg), 0);
        
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
                <span>Current: ${BashanPOS.formatStock(product.currentStockKg, product.nguniaKg || 1000)}</span>
                <span>Price: ${BashanPOS.formatCurrency(product.pricePerKg)}/kg</span>
            </div>
        `;
        document.getElementById('currentStockDisplay').textContent = BashanPOS.formatStock(product.currentStockKg, product.nguniaKg || 1000);
        
        // Reset form
        document.getElementById('adjNgunias').value = '0';
        document.getElementById('adjKg').value = '0';
        document.getElementById('adjReason').value = '';
        document.getElementById('adjOtherReason').value = '';
        document.getElementById('adjNotes').value = '';
        document.getElementById('adjTotalDisplay').textContent = '0 kg (0 ngunias)';
        document.getElementById('newStockDisplay').textContent = BashanPOS.formatStock(product.currentStockKg, product.nguniaKg || 1000);
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
        
        const currentStock = this.currentAdjustProduct.currentStockKg;
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
        
        if (this.adjustmentType === 'remove' && totalKg > this.currentAdjustProduct.currentStockKg) {
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
            ? this.currentAdjustProduct.currentStockKg + totalKg
            : this.currentAdjustProduct.currentStockKg - totalKg;
        
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
        const ngunias = Math.floor(product.currentStockKg / nguniaSize);
        const remainder = product.currentStockKg % nguniaSize;
        
        document.getElementById('productModalTitle').textContent = 'Edit Product';
        document.getElementById('editProductId').value = product.id;
        document.getElementById('productName').value = product.name;
        document.getElementById('productCategory').value = product.category || '';
        document.getElementById('productPrice').value = product.pricePerKg;
        document.getElementById('productNguniaSize').value = nguniaSize;
        document.getElementById('productInitNgunias').value = ngunias;
        document.getElementById('productInitKg').value = remainder.toFixed(2);
        document.getElementById('productThreshold').value = product.lowStockThreshold || 100;
        
        document.getElementById('addProductModal').classList.add('active');
    }async saveProduct() {
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
    
    // FIX: Ensure totalStock is a valid number
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
    
    try {
        if (editId) {
            // Update existing product
            await BashanPOS.productsRef.doc(editId).update(productData);
            BashanPOS.showNotification('Product updated successfully!', 'success');
            BashanPOS.logAudit('PRODUCT_EDIT', `Edited product: ${name}`);
        } else {
            // Add new product
            productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await BashanPOS.productsRef.add(productData);
            BashanPOS.showNotification('Product added successfully!', 'success');
            BashanPOS.logAudit('PRODUCT_ADD', `Added product: ${name}`);
        }
        
        this.closeProductModal();
        await this.loadProducts();
    } catch (error) {
        console.error('Save product error:', error);
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
                '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">Failed to load history</td></tr>';
        }
    }
    
    renderHistory() {
        const tbody = document.getElementById('historyTableBody');
        
        if (this.historyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">No stock movements found</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.historyData.map(log => `
            <tr>
                <td>${BashanPOS.formatDate(log.timestamp)}</td>
                <td>${log.productName}</td>
                <td><span class="type-badge ${log.type}">${log.type === 'add' ? 'Added' : 'Removed'}</span></td>
                <td>${log.quantityKg?.toFixed(2)} kg (${log.quantityNgunia?.toFixed(3)} ngunias)</td>
                <td>${log.beforeStock?.toFixed(2)} kg</td>
                <td>${log.afterStock?.toFixed(2)} kg</td>
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
        
        let csv = 'Product,Category,Ngunia Size (kg),Current Stock (kg),Price/kg (KSH),Stock Value,Status\n';
        
        filtered.forEach(p => {
            const nguniaSize = p.nguniaKg || 1000;
            const status = p.currentStockKg <= 0 ? 'Out of Stock' : 
                          p.currentStockKg <= (p.lowStockThreshold || 100) ? 'Low Stock' : 'In Stock';
            const categoryName = this.categories.find(c => c.id === p.category)?.name || 'N/A';
            
            csv += `"${p.name}","${categoryName}",${nguniaSize},${p.currentStockKg},${p.pricePerKg},${p.currentStockKg * p.pricePerKg},"${status}"\n`;
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
                   `${log.quantityKg},${log.quantityNgunia},${log.beforeStock},${log.afterStock},` +
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
