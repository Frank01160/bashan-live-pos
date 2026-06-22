// ============================================
// BASHAAN POS - SETTINGS ENGINE
// ============================================

class SettingsSystem {
    constructor() {
        this.user = null;
        this.settings = null;
        this.categories = [];
        
        this.init();
    }
    
    async init() {
        // Wait for BashanPOS to be available
        if (!window.BashanPOS) {
            console.error('❌ BashanPOS not loaded. Retrying...');
            setTimeout(() => this.init(), 500);
            return;
        }
        
        this.user = BashanPOS.checkAuth();
        if (!this.user) return;
        
        if (this.user.role !== 'manager') {
            BashanPOS.showNotification('Only managers can access settings', 'warning');
            setTimeout(() => window.location.href = 'pos.html', 2000);
            return;
        }
        
        this.settings = await BashanPOS.getSettings();
        
        this.setupUI();
        this.setupNavigation();
        this.setupEventListeners();
        this.loadSettings();
        await this.loadCategories();
        
        BashanPOS.logAudit('SETTINGS_OPEN', 'Settings page loaded');
        console.log('✅ Settings System Ready');
    }
    
    setupUI() {
        document.getElementById('userBadge').textContent = `${this.user.role}: ${this.user.name}`;
    }
    
    setupNavigation() {
        document.querySelectorAll('.settings-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active from all buttons
                document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
                // Add active to clicked button
                btn.classList.add('active');
                
                // Hide all panels
                document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
                // Show selected panel
                const tab = btn.dataset.tab;
                const panel = document.getElementById(`panel-${tab}`);
                if (panel) {
                    panel.classList.add('active');
                }
            });
        });
    }
    
    setupEventListeners() {
        // Business Info
        const saveBusinessBtn = document.getElementById('saveBusinessBtn');
        if (saveBusinessBtn) {
            saveBusinessBtn.addEventListener('click', () => this.saveBusinessInfo());
        }
        
        // Categories
        const addCategoryBtn = document.getElementById('addCategoryBtn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', () => this.addCategory());
        }
        
        // Also allow Enter key to add category
        const newCategoryInput = document.getElementById('newCategoryName');
        if (newCategoryInput) {
            newCategoryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addCategory();
                }
            });
        }
        
        // Security
        const updateManagerBtn = document.getElementById('updateManagerPassBtn');
        if (updateManagerBtn) {
            updateManagerBtn.addEventListener('click', () => this.updateManagerPassword());
        }
        
        const updateSellerBtn = document.getElementById('updateSellerPassBtn');
        if (updateSellerBtn) {
            updateSellerBtn.addEventListener('click', () => this.updateSellerPassword());
        }
        
        const saveSessionBtn = document.getElementById('saveSessionBtn');
        if (saveSessionBtn) {
            saveSessionBtn.addEventListener('click', () => this.saveSessionSettings());
        }
        
        // Preferences
        const savePreferencesBtn = document.getElementById('savePreferencesBtn');
        if (savePreferencesBtn) {
            savePreferencesBtn.addEventListener('click', () => this.savePreferences());
        }
        
        // Data Export
        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => this.exportAllData());
        }
        
        // Data Import
        const importDataBtn = document.getElementById('importDataBtn');
        const importFile = document.getElementById('importFile');
        if (importDataBtn && importFile) {
            importDataBtn.addEventListener('click', () => importFile.click());
            importFile.addEventListener('change', (e) => this.importData(e));
        }
        
        // Danger Zone
        const clearSalesBtn = document.getElementById('clearSalesBtn');
        if (clearSalesBtn) {
            clearSalesBtn.addEventListener('click', () => this.clearOldSales());
        }
        
        const resetStockBtn = document.getElementById('resetStockBtn');
        if (resetStockBtn) {
            resetStockBtn.addEventListener('click', () => this.resetAllStock());
        }
        
        const deleteAllBtn = document.getElementById('deleteAllBtn');
        if (deleteAllBtn) {
            deleteAllBtn.addEventListener('click', () => this.deleteAllData());
        }
        
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => BashanPOS.logout());
        }
        
        console.log('✅ Event listeners attached');
    }
    
    loadSettings() {
        if (!this.settings) {
            console.log('⚠️ No settings loaded yet, using defaults');
            return;
        }
        
        const fields = {
            'businessName': this.settings.businessName || '',
            'businessAddress': this.settings.businessAddress || '',
            'businessPhone': this.settings.businessPhone || '',
            'businessEmail': this.settings.businessEmail || '',
            'receiptFooter': this.settings.receiptFooter || '',
            'defaultNguniaSize': this.settings.nguniaDefault || 1000,
            'lowStockThreshold': this.settings.lowStockThreshold || 100,
            'maxDiscount': this.settings.maxDiscount || 5000,
            'sessionTimeout': this.settings.sessionTimeout || 30,
            'maxAttempts': this.settings.maxAttempts || 5
        };
        
        Object.entries(fields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        });
        
        console.log('✅ Settings loaded into form');
    }
    
    async saveBusinessInfo() {
        const data = {
            businessName: document.getElementById('businessName')?.value?.trim() || '',
            businessAddress: document.getElementById('businessAddress')?.value?.trim() || '',
            businessPhone: document.getElementById('businessPhone')?.value?.trim() || '',
            businessEmail: document.getElementById('businessEmail')?.value?.trim() || '',
            receiptFooter: document.getElementById('receiptFooter')?.value?.trim() || ''
        };
        
        try {
            await BashanPOS.settingsRef.doc('app').update(data);
            this.settings = { ...this.settings, ...data };
            BashanPOS.showNotification('Business info saved!', 'success');
            BashanPOS.logAudit('SETTINGS_UPDATE', 'Business info updated');
            console.log('✅ Business info saved');
        } catch (error) {
            console.error('❌ Save error:', error);
            BashanPOS.showNotification('Failed to save: ' + error.message, 'error');
        }
    }
    
    // ============ CATEGORIES ============
    async loadCategories() {
        try {
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            this.categories = [];
            snapshot.forEach(doc => {
                this.categories.push({ id: doc.id, ...doc.data() });
            });
            this.renderCategories();
            console.log('✅ Categories loaded:', this.categories.length);
        } catch (error) {
            console.error('❌ Load categories error:', error);
            document.getElementById('categoriesList').innerHTML = 
                '<p class="empty-message" style="color:red;">Failed to load categories</p>';
        }
    }
    
    renderCategories() {
        const list = document.getElementById('categoriesList');
        if (!list) return;
        
        if (this.categories.length === 0) {
            list.innerHTML = '<p class="empty-message">No categories yet. Add one above.</p>';
            return;
        }
        
        list.innerHTML = this.categories.map((cat, index) => `
            <div class="category-item" data-id="${cat.id}">
                <div class="category-info">
                    <span class="category-order">#${index + 1}</span>
                    <span class="category-name">${cat.name}</span>
                </div>
                <div class="category-actions">
                    <button class="icon-btn edit-btn" onclick="settingsSystem.editCategory('${cat.id}')" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="icon-btn delete-btn" onclick="settingsSystem.deleteCategory('${cat.id}')" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    async addCategory() {
        const input = document.getElementById('newCategoryName');
        if (!input) return;
        
        const name = input.value.trim();
        if (!name) {
            BashanPOS.showNotification('Enter a category name', 'warning');
            input.focus();
            return;
        }
        
        // Check for duplicate
        if (this.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            BashanPOS.showNotification('Category already exists!', 'warning');
            return;
        }
        
        try {
            await BashanPOS.categoriesRef.add({
                name: name,
                displayOrder: this.categories.length,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            input.value = '';
            BashanPOS.showNotification(`Category "${name}" added!`, 'success');
            BashanPOS.logAudit('CATEGORY_ADD', `Added: ${name}`);
            await this.loadCategories();
        } catch (error) {
            console.error('❌ Add category error:', error);
            BashanPOS.showNotification('Failed to add category: ' + error.message, 'error');
        }
    }
    
    async editCategory(id) {
        const cat = this.categories.find(c => c.id === id);
        if (!cat) return;
        
        const newName = prompt('Edit category name:', cat.name);
        if (!newName || newName.trim() === '' || newName.trim() === cat.name) return;
        
        try {
            await BashanPOS.categoriesRef.doc(id).update({ name: newName.trim() });
            BashanPOS.showNotification('Category updated!', 'success');
            BashanPOS.logAudit('CATEGORY_EDIT', `Renamed to: ${newName}`);
            await this.loadCategories();
        } catch (error) {
            console.error('❌ Edit category error:', error);
            BashanPOS.showNotification('Failed to update category', 'error');
        }
    }
    
    async deleteCategory(id) {
        const cat = this.categories.find(c => c.id === id);
        if (!cat) return;
        
        const confirmed = await BashanPOS.showConfirm(
            `Delete category "${cat.name}"?\n\nProducts in this category will become uncategorized.`
        );
        if (!confirmed) return;
        
        try {
            await BashanPOS.categoriesRef.doc(id).delete();
            BashanPOS.showNotification('Category deleted!', 'success');
            BashanPOS.logAudit('CATEGORY_DELETE', `Deleted: ${cat.name}`);
            await this.loadCategories();
        } catch (error) {
            console.error('❌ Delete category error:', error);
            BashanPOS.showNotification('Failed to delete category', 'error');
        }
    }
    
    // ============ SECURITY ============
    async updateManagerPassword() {
        const current = document.getElementById('managerCurrentPass')?.value || '';
        const newPass = document.getElementById('managerNewPass')?.value || '';
        const confirm = document.getElementById('managerConfirmPass')?.value || '';
        
        if (!current || !newPass || !confirm) {
            BashanPOS.showNotification('All fields are required', 'warning');
            return;
        }
        
        if (newPass !== confirm) {
            BashanPOS.showNotification('Passwords do not match', 'warning');
            return;
        }
        
        if (newPass.length < 4) {
            BashanPOS.showNotification('Password must be at least 4 characters', 'warning');
            return;
        }
        
        // Verify current password
        const verifyResult = await BashanPOS.verifyPassword(current, 'manager');
        if (!verifyResult.success) {
            BashanPOS.showNotification('Current password is incorrect', 'error');
            return;
        }
        
        // Update password
        const result = await BashanPOS.updatePassword(newPass, 'manager');
        if (result.success) {
            BashanPOS.showNotification('Manager password updated!', 'success');
            document.getElementById('managerCurrentPass').value = '';
            document.getElementById('managerNewPass').value = '';
            document.getElementById('managerConfirmPass').value = '';
        } else {
            BashanPOS.showNotification('Failed to update password: ' + result.message, 'error');
        }
    }
    
    async updateSellerPassword() {
        const authPass = document.getElementById('sellerAuthPass')?.value || '';
        const newPass = document.getElementById('sellerNewPass')?.value || '';
        
        if (!authPass || !newPass) {
            BashanPOS.showNotification('All fields are required', 'warning');
            return;
        }
        
        if (newPass.length < 4) {
            BashanPOS.showNotification('Password must be at least 4 characters', 'warning');
            return;
        }
        
        // Verify manager password for authorization
        const verifyResult = await BashanPOS.verifyPassword(authPass, 'manager');
        if (!verifyResult.success) {
            BashanPOS.showNotification('Manager password is incorrect', 'error');
            return;
        }
        
        // Update seller password
        const result = await BashanPOS.updatePassword(newPass, 'seller');
        if (result.success) {
            BashanPOS.showNotification('Seller password updated!', 'success');
            document.getElementById('sellerAuthPass').value = '';
            document.getElementById('sellerNewPass').value = '';
        } else {
            BashanPOS.showNotification('Failed to update password: ' + result.message, 'error');
        }
    }
    
    async saveSessionSettings() {
        const timeout = parseInt(document.getElementById('sessionTimeout')?.value) || 30;
        const maxAttempts = parseInt(document.getElementById('maxAttempts')?.value) || 5;
        
        try {
            await BashanPOS.settingsRef.doc('app').update({
                sessionTimeout: timeout,
                maxAttempts: maxAttempts
            });
            this.settings = { ...this.settings, sessionTimeout: timeout, maxAttempts: maxAttempts };
            BashanPOS.showNotification('Session settings saved!', 'success');
        } catch (error) {
            console.error('❌ Save error:', error);
            BashanPOS.showNotification('Failed to save: ' + error.message, 'error');
        }
    }
    
    // ============ PREFERENCES ============
    async savePreferences() {
        const nguniaDefault = parseInt(document.getElementById('defaultNguniaSize')?.value) || 1000;
        const lowStockThreshold = parseInt(document.getElementById('lowStockThreshold')?.value) || 100;
        const maxDiscount = parseInt(document.getElementById('maxDiscount')?.value) || 5000;
        
        try {
            await BashanPOS.settingsRef.doc('app').update({
                nguniaDefault: nguniaDefault,
                lowStockThreshold: lowStockThreshold,
                maxDiscount: maxDiscount
            });
            this.settings = { 
                ...this.settings, 
                nguniaDefault, 
                lowStockThreshold, 
                maxDiscount 
            };
            BashanPOS.showNotification('Preferences saved!', 'success');
            console.log('✅ Preferences saved');
        } catch (error) {
            console.error('❌ Save error:', error);
            BashanPOS.showNotification('Failed to save preferences: ' + error.message, 'error');
        }
    }
    
    // ============ DATA MANAGEMENT ============
    async exportAllData() {
        BashanPOS.showNotification('Exporting data...', 'info');
        
        try {
            const data = {};
            
            // Products
            const productsSnap = await BashanPOS.productsRef.get();
            data.products = [];
            productsSnap.forEach(doc => data.products.push({ id: doc.id, ...doc.data() }));
            
            // Categories
            const categoriesSnap = await BashanPOS.categoriesRef.get();
            data.categories = [];
            categoriesSnap.forEach(doc => data.categories.push({ id: doc.id, ...doc.data() }));
            
            // Sales
            const salesSnap = await BashanPOS.salesRef.orderBy('timestamp', 'desc').limit(1000).get();
            data.sales = [];
            salesSnap.forEach(doc => {
                const sale = doc.data();
                data.sales.push({
                    id: doc.id,
                    ...sale,
                    timestamp: sale.timestamp?.toDate?.()?.toISOString() || null
                });
            });
            
            // Stock Log
            const stockLogSnap = await BashanPOS.stockLogRef.orderBy('timestamp', 'desc').limit(500).get();
            data.stockLog = [];
            stockLogSnap.forEach(doc => {
                const log = doc.data();
                data.stockLog.push({
                    id: doc.id,
                    ...log,
                    timestamp: log.timestamp?.toDate?.()?.toISOString() || null
                });
            });
            
            // Settings (without passwords)
            const settingsData = { ...this.settings };
            delete settingsData.passwordManager;
            delete settingsData.passwordSeller;
            data.settings = settingsData;
            
            data.exportDate = new Date().toISOString();
            data.version = BashanPOS.APP_VERSION;
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bashan_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            BashanPOS.showNotification('Data exported successfully!', 'success');
            console.log('✅ Data exported');
        } catch (error) {
            console.error('❌ Export error:', error);
            BashanPOS.showNotification('Export failed: ' + error.message, 'error');
        }
    }
    
    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const confirmed = await BashanPOS.showConfirm(
            'Import data from backup? This will merge with existing data.'
        );
        if (!confirmed) {
            event.target.value = '';
            return;
        }
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            const batch = BashanPOS.db.batch();
            let count = 0;
            
            if (data.products && Array.isArray(data.products)) {
                data.products.forEach(p => {
                    const { id, ...productData } = p;
                    if (id) {
                        // Remove server timestamp fields
                        delete productData.createdAt;
                        delete productData.updatedAt;
                        batch.set(BashanPOS.productsRef.doc(id), productData, { merge: true });
                        count++;
                    }
                });
            }
            
            if (data.categories && Array.isArray(data.categories)) {
                data.categories.forEach(c => {
                    const { id, ...catData } = c;
                    if (id) {
                        batch.set(BashanPOS.categoriesRef.doc(id), catData, { merge: true });
                        count++;
                    }
                });
            }
            
            await batch.commit();
            BashanPOS.showNotification(`Imported ${count} records!`, 'success');
            BashanPOS.logAudit('DATA_IMPORT', `Imported ${count} records`);
            
            await this.loadCategories();
            console.log('✅ Data imported');
        } catch (error) {
            console.error('❌ Import error:', error);
            BashanPOS.showNotification('Import failed: Invalid file format', 'error');
        }
        
        event.target.value = '';
    }
    
    async clearOldSales() {
        const months = parseInt(document.getElementById('clearSalesPeriod')?.value) || 3;
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - months);
        
        const confirmed = await BashanPOS.showConfirm(
            `Delete all sales older than ${months} months?\n\nThis cannot be undone!`
        );
        if (!confirmed) return;
        
        try {
            const snapshot = await BashanPOS.salesRef
                .where('timestamp', '<', cutoffDate)
                .get();
            
            if (snapshot.empty) {
                BashanPOS.showNotification('No old sales to clear', 'info');
                return;
            }
            
            const batch = BashanPOS.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            BashanPOS.showNotification(`Deleted ${snapshot.size} old sales records`, 'success');
            BashanPOS.logAudit('DATA_CLEAR', `Cleared ${snapshot.size} sales older than ${months} months`);
            console.log('✅ Old sales cleared:', snapshot.size);
        } catch (error) {
            console.error('❌ Clear error:', error);
            BashanPOS.showNotification('Failed to clear sales: ' + error.message, 'error');
        }
    }
    
    async resetAllStock() {
        const confirmed = await BashanPOS.showConfirm(
            'RESET ALL STOCK TO ZERO?\n\nThis will set every product\'s stock to 0 kg.\nThis cannot be undone!'
        );
        if (!confirmed) return;
        
        try {
            const snapshot = await BashanPOS.productsRef.get();
            
            if (snapshot.empty) {
                BashanPOS.showNotification('No products to reset', 'info');
                return;
            }
            
            const batch = BashanPOS.db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, {
                    currentStockKg: 0,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            await batch.commit();
            BashanPOS.showNotification(`Reset stock for ${snapshot.size} products`, 'warning');
            BashanPOS.logAudit('STOCK_RESET', 'All stock reset to zero');
            console.log('✅ Stock reset');
        } catch (error) {
            console.error('❌ Reset error:', error);
            BashanPOS.showNotification('Failed to reset stock: ' + error.message, 'error');
        }
    }
    
    async deleteAllData() {
        const confirmed = await BashanPOS.showConfirm(
            '⚠️ DELETE ALL DATA?\n\nThis will permanently delete ALL products, sales, categories, and logs.\n\nExport a backup first!'
        );
        if (!confirmed) return;
        
        const doubleConfirmed = await BashanPOS.showConfirm(
            '⚠️ FINAL WARNING!\n\nThis action is IRREVERSIBLE!\nAll your data will be lost forever.'
        );
        if (!doubleConfirmed) return;
        
        try {
            const collections = ['products', 'categories', 'sales', 'stockLog', 'auditLog'];
            let totalDeleted = 0;
            
            for (const collectionName of collections) {
                const snapshot = await BashanPOS.db.collection(collectionName).get();
                if (!snapshot.empty) {
                    const batch = BashanPOS.db.batch();
                    snapshot.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                    totalDeleted += snapshot.size;
                }
            }
            
            // Reset settings to defaults
            await BashanPOS.settingsRef.doc('app').set({
                businessName: 'Bashan Livestock Feeds',
                businessAddress: '',
                businessPhone: '',
                businessEmail: '',
                receiptFooter: 'Thank you for your business!',
                nguniaDefault: 1000,
                lowStockThreshold: 100,
                maxDiscount: 5000,
                sessionTimeout: 30,
                maxAttempts: 5,
                passwordManager: '76a3e7c8',  // hash for 'admin123'
                passwordSeller: '5d2f1a9b',    // hash for 'seller123'
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            BashanPOS.showNotification(`Deleted ${totalDeleted} records. System reset.`, 'warning');
            BashanPOS.logAudit('DATA_DELETE_ALL', `Deleted ${totalDeleted} records`);
            console.log('✅ All data deleted');
            
            setTimeout(() => {
                BashanPOS.logout('System reset');
            }, 2000);
        } catch (error) {
            console.error('❌ Delete error:', error);
            BashanPOS.showNotification('Failed to delete data: ' + error.message, 'error');
        }
    }
}

// Initialize when DOM is ready
let settingsSystem;
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 Settings page DOM loaded');
    settingsSystem = new SettingsSystem();
    window.settingsSystem = settingsSystem;
});
