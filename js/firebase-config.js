// ============================================
// BASHAAN LIVESTOCK FEEDS POS
// Firebase Configuration & Core Functions
// ============================================

// Your Firebase config - Replace with your own when deploying
const firebaseConfig = {
  apiKey: "AIzaSyB5eH7B9IbQb-slA6rphFhGhGwyXfj3moE",
  authDomain: "bashan-pos-c539b.firebaseapp.com",
  projectId: "bashan-pos-c539b",
  storageBucket: "bashan-pos-c539b.firebasestorage.app",
  messagingSenderId: "50077340319",
  appId: "1:50077340319:web:345e7b89b9d2908ca988aa"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence
db.enablePersistence()
    .then(() => console.log('Offline mode enabled'))
    .catch(err => console.log('Persistence error:', err.code));

// ============================================
// COLLECTION REFERENCES
// ============================================
const productsRef = db.collection('products');
const categoriesRef = db.collection('categories');
const salesRef = db.collection('sales');
const stockLogRef = db.collection('stockLog');
const settingsRef = db.collection('settings');
const auditLogRef = db.collection('auditLog');
const sessionsRef = db.collection('sessions');

// ============================================
// CORE CONSTANTS
// ============================================
const APP_VERSION = '1.0.0';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const DEFAULT_NGUNIA_KG = 1000;
const LOW_STOCK_THRESHOLD = 100; // kg

// ============================================
// AUDIT LOGGING
// ============================================
async function logAudit(action, details) {
    const user = JSON.parse(sessionStorage.getItem('bashan_user'));
    if (!user) return;
    
    try {
        await auditLogRef.add({
            userId: user.id,
            userName: user.name,
            role: user.role,
            action: action,
            details: details,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            ipHash: await getIPHash()
        });
    } catch (error) {
        console.error('Audit log error:', error);
    }
}

async function getIPHash() {
    // Simple hash of timestamp + user agent for tracking
    const data = navigator.userAgent + Date.now();
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// ============================================
// AUTH FUNCTIONS
// ============================================
async function verifyPassword(inputPassword, role = 'seller') {
    try {
        const settingsDoc = await settingsRef.doc('app').get();
        if (!settingsDoc.exists) {
            // First time setup - create default passwords
            await settingsRef.doc('app').set({
                passwordManager: hashPassword('admin123'),
                passwordSeller: hashPassword('seller123'),
                businessName: 'Bashan Livestock Feeds',
                businessAddress: '',
                businessPhone: '',
                businessEmail: '',
                nguniaDefault: 1000,
                lowStockThreshold: 100,
                maxDiscount: 5000,
                sessionTimeout: 30,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            logAudit('SYSTEM_INIT', 'Default settings created');
        }
        
        const settings = settingsDoc.data();
        const storedHash = role === 'manager' ? settings.passwordManager : settings.passwordSeller;
        const inputHash = hashPassword(inputPassword);
        
        if (inputHash === storedHash) {
            return { success: true, role: role };
        }
        return { success: false, message: 'Incorrect password' };
    } catch (error) {
        console.error('Auth error:', error);
        return { success: false, message: 'Authentication failed. Check connection.' };
    }
}

function hashPassword(password) {
    // Simple but effective hashing (for demo - use bcrypt in production)
    let hash = 0;
    const salt = "BASHAN_POS_SALT_2024";
    const combined = password + salt;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    // Add complexity
    for (let i = 0; i < 1000; i++) {
        hash = ((hash << 5) - hash) + hash % 256;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

async function updatePassword(newPassword, role) {
    try {
        const field = role === 'manager' ? 'passwordManager' : 'passwordSeller';
        await settingsRef.doc('app').update({
            [field]: hashPassword(newPassword)
        });
        await logAudit('PASSWORD_CHANGE', `Password changed for ${role}`);
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// ============================================
// SESSION MANAGEMENT
// ============================================
function saveSession(userData) {
    const session = {
        ...userData,
        loginTime: Date.now(),
        token: generateToken()
    };
    sessionStorage.setItem('bashan_user', JSON.stringify(session));
    
    // Set session timeout
    setTimeout(checkSession, SESSION_TIMEOUT);
    
    // Track activity
    document.addEventListener('click', resetSessionTimer);
    document.addEventListener('keypress', resetSessionTimer);
    
    return session;
}

function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function checkSession() {
    const user = JSON.parse(sessionStorage.getItem('bashan_user'));
    if (!user) return;
    
    if (Date.now() - user.loginTime > SESSION_TIMEOUT) {
        logout('Session expired');
    }
}

function resetSessionTimer() {
    const user = JSON.parse(sessionStorage.getItem('bashan_user'));
    if (user) {
        user.loginTime = Date.now();
        sessionStorage.setItem('bashan_user', JSON.stringify(user));
    }
}

function logout(reason = '') {
    const user = JSON.parse(sessionStorage.getItem('bashan_user'));
    if (user) {
        logAudit('LOGOUT', reason || 'Manual logout');
    }
    sessionStorage.removeItem('bashan_user');
    sessionStorage.removeItem('bashan_cart');
    window.location.href = 'index.html';
}

function checkAuth() {
    const user = JSON.parse(sessionStorage.getItem('bashan_user'));
    if (!user) {
        window.location.href = 'index.html';
        return null;
    }
    if (Date.now() - user.loginTime > SESSION_TIMEOUT) {
        logout('Session expired');
        return null;
    }
    return user;
}

// ============================================
// PRODUCT FUNCTIONS
// ============================================
async function getProducts() {
    try {
        const snapshot = await productsRef.where('archived', '==', false).get();
        const products = [];
        snapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });
        return products;
    } catch (error) {
        console.error('Get products error:', error);
        return [];
    }
}

async function getProductsRealtime(callback) {
    return productsRef.where('archived', '==', false)
        .onSnapshot(snapshot => {
            const products = [];
            snapshot.forEach(doc => {
                products.push({ id: doc.id, ...doc.data() });
            });
            callback(products);
        });
}

async function updateStock(productId, newStockKg, reason, notes, userName, userId) {
    try {
        const productDoc = await productsRef.doc(productId).get();
        const oldStock = productDoc.data().currentStockKg;
        const difference = newStockKg - oldStock;
        
        // Update product stock
        await productsRef.doc(productId).update({
            currentStockKg: newStockKg,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Log the stock movement
        await stockLogRef.add({
            productId: productId,
            productName: productDoc.data().name,
            type: difference > 0 ? 'add' : 'remove',
            quantityKg: Math.abs(difference),
            quantityNgunia: Math.abs(difference) / (productDoc.data().nguniaKg || DEFAULT_NGUNIA_KG),
            reason: reason,
            notes: notes || '',
            doneBy: userId,
            doneByName: userName,
            beforeStock: oldStock,
            afterStock: newStockKg,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await logAudit('STOCK_UPDATE', `${productDoc.data().name}: ${oldStock}kg → ${newStockKg}kg (${reason})`);
        
        return { success: true };
    } catch (error) {
        console.error('Stock update error:', error);
        return { success: false, message: error.message };
    }
}

// ============================================
// SALE FUNCTIONS
// ============================================
async function completeSale(saleData) {
    try {
        const batch = db.batch();
        const saleRef = salesRef.doc();
        
        // Generate receipt number
        const date = new Date();
        const receiptNumber = 'BSH-' + date.getFullYear() + 
                              String(date.getMonth() + 1).padStart(2, '0') +
                              String(date.getDate()).padStart(2, '0') + '-' +
                              String(Math.floor(Math.random() * 9999)).padStart(4, '0');
        
        const sale = {
            receiptNumber: receiptNumber,
            items: saleData.items,
            subtotal: saleData.subtotal,
            discountKsh: saleData.discountKsh || 0,
            total: saleData.total,
            paymentMethod: saleData.paymentMethod || 'Cash',
            customerName: saleData.customerName || '',
            sellerId: saleData.sellerId,
            sellerName: saleData.sellerName,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        batch.set(saleRef, sale);
        
        // Deduct stock for each item
        saleData.items.forEach(item => {
            const productRef = productsRef.doc(item.productId);
            batch.update(productRef, {
                currentStockKg: firebase.firestore.FieldValue.increment(-item.quantityKg)
            });
        });
        
        await batch.commit();
        
        await logAudit('SALE_COMPLETE', `Sale ${receiptNumber}: KSH ${saleData.total}`);
        
        return { success: true, receiptNumber, saleId: saleRef.id };
    } catch (error) {
        console.error('Sale error:', error);
        return { success: false, message: error.message };
    }
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================
async function getSettings() {
    try {
        const doc = await settingsRef.doc('app').get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error('Settings error:', error);
        return null;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(amount) {
    return 'KSH ' + Number(amount).toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatStock(kg, nguniaSize = DEFAULT_NGUNIA_KG) {
    if (kg <= 0) return '0 kg (Out of Stock)';
    
    const ngunias = Math.floor(kg / nguniaSize);
    const remainder = kg % nguniaSize;
    
    if (ngunias === 0) {
        return `${remainder.toFixed(2)} kg`;
    } else if (remainder === 0) {
        return `${ngunias} ngunia${ngunias > 1 ? 's' : ''} (${kg} kg)`;
    } else {
        return `${ngunias} ngunia${ngunias > 1 ? 's' : ''} + ${remainder.toFixed(2)} kg`;
    }
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.innerHTML = `
            <div class="confirm-content">
                <p>${message}</p>
                <div class="confirm-buttons">
                    <button class="btn-cancel" id="confirmCancel">Cancel</button>
                    <button class="btn-confirm" id="confirmOk">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('confirmCancel').onclick = () => {
            modal.remove();
            resolve(false);
        };
        document.getElementById('confirmOk').onclick = () => {
            modal.remove();
            resolve(true);
        };
    });
}

// ============================================
// EXPORT FOR OTHER SCRIPTS
// ============================================
window.BashanPOS = {
    db, auth,
    productsRef, categoriesRef, salesRef, stockLogRef, settingsRef, auditLogRef,
    verifyPassword, updatePassword, checkAuth, logout, saveSession,
    getProducts, getProductsRealtime, updateStock, completeSale,
    getSettings, logAudit,
    formatCurrency, formatStock, formatDate,
    showNotification, showConfirm,
    APP_VERSION, DEFAULT_NGUNIA_KG
};

console.log('🔥 Bashan POS Core Loaded - Version', APP_VERSION);