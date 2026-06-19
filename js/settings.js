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
    }
    
    setupUI() {
        document.getElementById('userBadge').textContent = `${this.user.role}: ${this.user.name}`;
    }
    
    setupNavigation() {
        document.querySelectorAll('.settings-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const tab = btn.dataset.tab;
                document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
                document.getElementById(`panel-${tab}`).classList.add('active');
            });
        });
    }
    
    setupEventListeners() {
        // Business Info
        document.getElementById('saveBusinessBtn').addEventListener('click', () => this.saveBusinessInfo());
        
        // Categories
        document.getElementById('addCategoryBtn').addEventListener('click', () => this.addCategory());
        
        // Security
        document.getElementById('updateManagerPassBtn').addEventListener('click', () => this.updateManagerPassword());
        document.getElementById('updateSellerPassBtn').addEventListener('click', () => this.updateSellerPassword());
        document.getElementById('saveSessionBtn').addEventListener('click', () => this.saveSessionSettings());
        
        // Preferences
        document.getElementById('savePreferencesBtn').addEventListener('click', () => this.savePreferences());
        
        // Data
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportAllData());
        document.getElementById('importDataBtn').addEventListener('click', () => document.getElementById('importFile').click());
        document.getElementById('importFile').addEventListener('change', (e) => this.importData(e));
        document.getElementById('clearSalesBtn').addEventListener('click', () => this.clearOldSales());
        document.getElementById('resetStockBtn').addEventListener('click', () => this.resetAllStock());
        document.getElementById('deleteAllBtn').addEventListener('click', () => this.deleteAllData());
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => BashanPOS.logout());
    }
    
    loadSettings() {
        if (!this.settings) return;
        
        document.getElementById('businessName').value = this.settings.businessName || '';
        document.getElementById('businessAddress').value = this.settings.businessAddress || '';
        document.getElementById('businessPhone').value = this.settings.businessPhone || '';
        document.getElementById('businessEmail').value = this.settings.businessEmail || '';
        document.getElementById('receiptFooter').value = this.settings.receiptFooter || '';
        document.getElementById('defaultNguniaSize').value = this.settings.nguniaDefault || 1000;
        document.getElementById('lowStockThreshold').value = this.settings.lowStockThreshold || 100;
        document.getElementById('maxDiscount').value = this.settings.maxDiscount || 5000;
        document.getElementById('sessionTimeout').value = this.settings.sessionTimeout || 30;
        document.getElementById('maxAttempts').value = this.settings.maxAttempts || 5;
    }
    
    async saveBusinessInfo() {
        const data = {
            businessName: document.getElementById('businessName').value.trim(),
            businessAddress: document.getElementById('businessAddress').value.trim(),
            businessPhone: document.getElementById('businessPhone').value.trim(),
            businessEmail: document.getElementById('businessEmail').value.trim(),
            receiptFooter: document.getElementById('receiptFooter').value.trim()
        };
        
        try {
            await BashanPOS.settingsRef.doc('app').update(data);
            BashanPOS.showNotification('Business info saved!', 'success');
            BashanPOS.logAudit('SETTINGS_UPDATE', 'Business info updated');
        } catch (error) {
            BashanPOS.showNotification('Failed to save: ' + error.message, 'error');
        }
    }
    
    // Categories
    async loadCategories() {
        try {
            const snapshot = await BashanPOS.categoriesRef.orderBy('displayOrder').get();
            this.categories = [];
            snapshot.forEach(doc => {
                this.categories.push({ id: doc.id, ...doc.data() });
            });
            this.renderCategories();
        } catch (error) {
            console.error('Load categories error:', error);
        }
    }
    
    renderCategories() {
        const list = document.getElementById('categoriesList');
        
        if (this.categories.length === 0) {
            list.innerHTML = '<p class="empty-message">No categories yet. Add one above.</p>';
            return;
        }
        
        list.innerHTML = this.categories.map(cat => `
            <div class="category-item" data-id="${cat.id}">
                <span class="category-name">${cat.name}</span>
                <div class="category-actions">
                    <button class="edit-cat-btn" onclick="settingsSystem.editCategory('${cat.id}')">✏️ Edit</button>
                    <button class="delete-cat-btn" onclick="settingsSystem.deleteCategory('${cat.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }
    
    async addCategory() {
        const name = document.getElementById('newCategoryName').value.trim();
        if (!name) {
            BashanPOS.showNotification('Enter category name', 'warning');
            return;
        }
        
        try {
            await BashanPOS.categoriesRef.add({
                name: name,
                displayOrder: this.categories.length,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            document.getElementById('newCategoryName').value = '';
            BashanPOS.showNotification('Category added!', 'success');
            await this.loadCategories();
        } catch (error) {
            BashanPOS.showNotification('Failed to add category', 'error');
        }
    }
    
    async editCategory(id) {
        const cat = this.categories.find(c => c.id === id);
        if (!cat) return;
        
        const newName = prompt('Edit category name:', cat.name);
        if (!newName || newName.trim() === cat.name) return;
        
        try {
            await BashanPOS.categoriesRef.doc(id).update({ name: newName.trim() });
            BashanPOS.showNotification('Category updated!', 'success');
            await this.loadCategories();
        } catch (error) {
            BashanPOS.showNotification('Failed to update category', 'error');
        }
    }
    
    async deleteCategory(id) {
        const cat = this.categories.find(c => c.id === id);
        if (!cat) return;
        
        const confirmed = await BashanPOS.showConfirm(`Delete category "${cat.name}"?`);
        if (!confirmed) return;
        
        try {
            await BashanPOS.categoriesRef.doc(id).delete();
            BashanPOS.showNotification('Category deleted!', 'success');
            await this.loadCategories();
        } catch (error) {
            BashanPOS.showNotification('Failed to delete category', 'error');
        }
    }
    
    // Security
    async updateManagerPassword() {
        const current = document.getElementById('managerCurrentPass').value;
        const newPass = document.getElementById('managerNewPass').value;
        const confirm = document.getElementById('managerConfirmPass').value;
        
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
        
        const verifyResult = await BashanPOS.verifyPassword(current, 'manager');
        if (!verifyResult.success) {
            BashanPOS.showNotification('Current password is incorrect', 'error');
            return;
        }
        
        const result = await BashanPOS.updatePassword(newPass, 'manager');
        if (result.success) {
            BashanPOS.showNotification('Manager password updated!', 'success');
            document.getElementById('managerCurrentPass').value = '';
            document.getElementById('managerNewPass').value = '';
            document.getElementById('managerConfirmPass').value = '';
        } else {
            BashanPOS.showNotification('Failed to update password', 'error');
        }
    }
    
    async updateSellerPassword() {
        const authPass = document.getElementById('sellerAuthPass').value;
        const newPass = document.getElementById('sellerNewPass').value;
        
        if (!authPass || !newPass) {
            BashanPOS.showNotification('All fields are required', 'warning');
            return;
        }
        
        if (newPass.length < 4) {
            BashanPOS.showNotification('Password must be at least 4 characters', 'warning');
            return;
        }
        
        const verifyResult = await BashanPOS.verifyPassword(authPass, 'manager');
        if (!verifyResult.success) {
            BashanPOS.showNotification('Manager password is incorrect', 'error');
            return;
        }
        
        const result = await BashanPOS.updatePassword(newPass, 'seller');
        if (result.success) {
            BashanPOS.showNotification('Seller password updated!', 'success');
            document.getElementById('sellerAuthPass').value = '';
            document.getElementById('sellerNewPass').value = '';
        }
    }
    
    async saveSessionSettings() {
        const timeout = parseInt(document.getElementById('sessionTimeout').value);
        const maxAttempts = parseInt(document.getElementById('maxAttempts').value);
        
        try {
            await BashanPOS.settingsRef.doc('app').update({
                sessionTimeout: timeout,
                maxAttempts: maxAttempts
            });
            BashanPOS.showNotification('Session settings saved!', 'success');
        } catch (error) {
            BashanPOS.showNotification('Failed to save settings', 'error');
        }
    }
    
    // Preferences
    async savePreferences() {
        const nguniaDefault = parseInt(document.getElementById('defaultNguniaSize').value);
        const lowStockThreshold = parseInt(document.getElementById('lowStockThreshold').value);
        const maxDiscount = parseInt(document.getElementById('maxDiscount').value);
        
        try {
            await BashanPOS.settingsRef.doc('app').update({
                nguniaDefault: nguniaDefault,
                lowStockThreshold: lowStockThreshold,
                maxDiscount: maxDiscount
            });
            BashanPOS.showNotification('Preferences saved!', 'success');
        } catch (error) {
            BashanPOS.showNotification('Failed to save preferences', 'error');
        }
    }
    
    // Data Management
    async exportAllData() {
        BashanPOS.showNotification('Exporting data...', 'info');
        
        try {
            const data = {};
            
            const productsSnap = await BashanPOS.productsRef.get();
            data.products = [];
            productsSnap.forEach(doc => data.products.push({ id: doc.id, ...doc.data() }));
            
            const categoriesSnap = await BashanPOS.categoriesRef.get();
            data.categories = [];
            categoriesSnap.forEach(doc => data.categories.push({ id: doc.id, ...doc.data() }));
            
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
            
            data.settings = this.settings;
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
        } catch (error) {
            BashanPOS.showNotification('Export failed: ' + error.message, 'error');
        }
    }
    
    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const confirmed = await BashanPOS.showConfirm(
            'Import data from backup? This will merge with existing data. Some duplicates may occur.'
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
            
            if (data.products) {
                data.products.forEach(p => {
                    const { id, ...productData } = p;
                    if (id) {
                        batch.set(BashanPOS.productsRef.doc(id), productData, { merge: true });
                        count++;
                    }
                });
            }
            
            if (data.categories) {
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
        } catch (error) {
            BashanPOS.showNotification('Import failed: Invalid file format', 'error');
        }
        
        event.target.value = '';
    }
    
    async clearOldSales() {
        const months = parseInt(document.getElementById('clearSalesPeriod').value);
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - months);
        
        const confirmed = await BashanPOS.showConfirm(
            `Delete all sales older than ${months} months? This cannot be undone!`
        );
        if (!confirmed) return;
        
        try {
            const snapshot = await BashanPOS.salesRef
                .where('timestamp', '<', cutoffDate)
                .get();
            
            const batch = BashanPOS.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            BashanPOS.showNotification(`Deleted ${snapshot.size} old sales records`, 'success');
            BashanPOS.logAudit('DATA_CLEAR', `Cleared ${snapshot.size} sales older than ${months} months`);
        } catch (error) {
            BashanPOS.showNotification('Failed to clear sales: ' + error.message, 'error');
        }
    }
    
    async resetAllStock() {
        const confirmed = await BashanPOS.showConfirm(
            'RESET ALL STOCK TO ZERO?\n\nThis will set every product\'s stock to 0 kg. This cannot be undone!'
        );
        if (!confirmed) return;
        
        const doubleConfirmed = await BashanPOS.showConfirm(
            'ARE YOU ABSOLUTELY SURE?\n\nType "RESET" to confirm.'
        );
        if (!doubleConfirmed) return;
        
        try {
            const snapshot = await BashanPOS.productsRef.get();
            const batch = BashanPOS.db.batch();
            
            snapshot.forEach(doc => {
                batch.update(doc.ref, {
                    currentStockKg: 0,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            await batch.commit();
            BashanPOS.showNotification('All stock has been reset to zero', 'warning');
            BashanPOS.logAudit('STOCK_RESET', 'All stock reset to zero');
        } catch (error) {
            BashanPOS.showNotification('Failed to reset stock', 'error');
        }
    }
    
    async deleteAllData() {
        const confirmed = await BashanPOS.showConfirm(
            'DELETE ALL DATA?\n\nThis will permanently delete ALL products, sales, categories, and logs. Export a backup first!'
        );
        if (!confirmed) return;
        
        const doubleConfirmed = await BashanPOS.showConfirm(
            'FINAL WARNING: This action is IRREVERSIBLE!\n\nAll your data will be lost forever.'
        );
        if (!doubleConfirmed) return;
        
        try {
            // Delete all collections
            const collections = ['products', 'categories', 'sales', 'stockLog', 'auditLog'];
            
            for (const collectionName of collections) {
                const snapshot = await BashanPOS.db.collection(collectionName).get();
                const batch = BashanPOS.db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
            
            // Reset settings to defaults
            await BashanPOS.settingsRef.doc('app').set({
                passwordManager: BashanPOS.hashPassword('admin123'),
                passwordSeller: BashanPOS.hashPassword('seller123'),
                businessName: 'Bashan Livestock Feeds',
                nguniaDefault: 1000,
                lowStockThreshold: 100,
                maxDiscount: 5000,
                sessionTimeout: 30,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            BashanPOS.showNotification('All data deleted. System reset to defaults.', 'warning');
            BashanPOS.logAudit('DATA_DELETE_ALL', 'All data deleted');
            
            setTimeout(() => BashanPOS.logout('System reset'), 3000);
        } catch (error) {
            BashanPOS.showNotification('Failed to delete data: ' + error.message, 'error');
        }
    }
}

let settingsSystem;
document.addEventListener('DOMContentLoaded', () => {
    settingsSystem = new SettingsSystem();
    window.settingsSystem = settingsSystem;
});