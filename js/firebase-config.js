// ============================================
// BASHAAN LIVESTOCK FEEDS POS
// Firebase Configuration & Core Functions
// ============================================

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
// We don't use Firebase Auth - we use custom password hashing

// Enable offline persistence
db.enablePersistence()
    .then(() => console.log('✅ Offline mode enabled'))
    .catch(err => console.log('⚠️ Persistence error:', err.code));

// ... rest of the file stays the same
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
const LOCKOUT_DURATION = 15 * 60 * 1000;
const SESSION_TIMEOUT = 30 * 60 * 1000;
const DEFAULT_NGUNIA_KG = 1000;
const LOW_STOCK_THRESHOLD = 100;

// ============================================
// AUDIT LOGGING
// ============================================
function logAudit(action, details) {
    const user = JSON.parse(sessionStorage.getItem('bashan_user'));
    if (!user) return;
    
    auditLogRef.add({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: action,
        details: details,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        ipHash: getIPHash()
    }).catch(err => console.error('Audit log error:', err));
}

function getIPHash() {
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
function verifyPassword(inputPassword, role) {
    return settingsRef.doc('app').get().then(doc => {
        if (!doc.exists) {
            // First time setup - create default passwords
            return settingsRef.doc('app').set({
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
            }).then(() => {
                logAudit('SYSTEM_INIT', 'Default settings created');
                return verifyPassword(inputPassword, role);
            });
        }
        
        const settings = doc.data();
        const storedHash = role === 'manager' ? settings.passwordManager : settings.passwordSeller;
        const inputHash = hashPassword(inputPassword);
        
        if (inputHash === storedHash) {
            return { success: true, role: role };
        }
        return { success: false, message: 'Incorrect password' };
    }).catch(error => {
        console.error('Auth error:', error);
        return { success: false, message: 'Authentication failed. Check connection.' };
    });
}

function hashPassword(password) {
    let hash = 0;
    const salt = "BASHAN_POS_SALT_2024";
    const combined = password + salt;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    for (let i = 0; i < 1000; i++) {
        hash = ((hash << 5) - hash) + hash % 256;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

function updatePassword(newPassword, role) {
    const field = role === 'manager' ? 'passwordManager' : 'passwordSeller';
    return settingsRef.doc('app').update({
        [field]: hashPassword(newPassword)
    }).then(() => {
        logAudit('PASSWORD_CHANGE', `Password changed for ${role}`);
        return { success: true };
    }).catch(error => {
        return { success: false, message: error.message };
    });
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
    
    setTimeout(checkSession, SESSION_TIMEOUT);
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

function logout(reason) {
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
function getProducts() {
    return productsRef.where('archived', '==', false).get()
        .then(snapshot => {
            const products = [];
            snapshot.forEach(doc => {
                products.push({ id: doc.id, ...doc.data() });
            });
            return products;
        })
        .catch(error => {
            console.error('Get products error:', error);
            return [];
        });
}

function getProductsRealtime(callback) {
    return productsRef.where('archived', '==', false)
        .onSnapshot(snapshot => {
            const products = [];
            snapshot.forEach(doc => {
                products.push({ id: doc.id, ...doc.data() });
            });
            callback(products);
        }, error => {
            console.error('Products realtime error:', error);
            // Return empty array on error
            callback([]);
        });
}

function updateStock(productId, newStockKg, reason, notes, userName, userId) {
    return productsRef.doc(productId).get()
        .then(productDoc => {
            if (!productDoc.exists) {
                return { success: false, message: 'Product not found' };
            }
            
            const oldStock = productDoc.data().currentStockKg || 0;
            const difference = newStockKg - oldStock;
            
            // Update product stock
            return productsRef.doc(productId).update({
                currentStockKg: newStockKg,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                // Log the stock movement
                return stockLogRef.add({
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
                }).then(() => {
                    logAudit('STOCK_UPDATE', `${productDoc.data().name}: ${oldStock}kg → ${newStockKg}kg (${reason})`);
                    return { success: true };
                });
            });
        })
        .catch(error => {
            console.error('Stock update error:', error);
            return { success: false, message: error.message };
        });
}

// ============================================
// SALE FUNCTIONS
// ============================================function completeSale(saleData) {
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
    
    // Deduct stock for each item based on UOM
    saleData.items.forEach(item => {
        const productRef = productsRef.doc(item.productId);
        const uom = item.uom || 'kg';
        const qty = item.qty || 0;
        
        switch(uom) {
            case 'kg':
                // Deduct kg from stock
                batch.update(productRef, {
                    currentStockKg: firebase.firestore.FieldValue.increment(-(item.qtyKg || qty * 1000))
                });
                break;
                
            case 'bags':
                // Deduct bag count
                batch.update(productRef, {
                    currentStockCount: firebase.firestore.FieldValue.increment(-qty),
                    currentStockKg: firebase.firestore.FieldValue.increment(-(qty * (item.kgPerBag || 50)))
                });
                break;
                
            case 'litres':
                batch.update(productRef, {
                    currentStockLitres: firebase.firestore.FieldValue.increment(-qty)
                });
                break;
                
            case 'ml':
                batch.update(productRef, {
                    currentStockMl: firebase.firestore.FieldValue.increment(-qty)
                });
                break;
                
            case 'pieces':
                batch.update(productRef, {
                    currentStockCount: firebase.firestore.FieldValue.increment(-qty)
                });
                break;
                
            case 'grams':
                batch.update(productRef, {
                    currentStockGrams: firebase.firestore.FieldValue.increment(-qty)
                });
                break;
                
            case 'sachets':
                batch.update(productRef, {
                    currentStockCount: firebase.firestore.FieldValue.increment(-qty)
                });
                break;
                
            case 'cartons':
                batch.update(productRef, {
                    currentStockCount: firebase.firestore.FieldValue.increment(-qty),
                    currentStockPieces: firebase.firestore.FieldValue.increment(-(qty * (item.itemsPerCarton || 12)))
                });
                break;
                
            case 'rolls':
                batch.update(productRef, {
                    currentStockCount: firebase.firestore.FieldValue.increment(-qty)
                });
                break;
                
            case 'metres':
                batch.update(productRef, {
                    currentStockMetres: firebase.firestore.FieldValue.increment(-qty)
                });
                break;
                
            default:
                // Fallback to kg
                batch.update(productRef, {
                    currentStockKg: firebase.firestore.FieldValue.increment(-(item.qtyKg || qty))
                });
        }
    });
    
    return batch.commit()
        .then(() => {
            logAudit('SALE_COMPLETE', `Sale ${receiptNumber}: KSH ${saleData.total} (${saleData.items.length} items)`);
            return { success: true, receiptNumber, saleId: saleRef.id };
        })
        .catch(error => {
            console.error('Sale error:', error);
            return { success: false, message: error.message };
        });
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================
function getSettings() {
    return settingsRef.doc('app').get()
        .then(doc => {
            if (doc.exists) {
                return doc.data();
            }
            return null;
        })
        .catch(error => {
            console.error('Settings error:', error);
            return null;
        });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(amount) {
    const num = Number(amount);
    if (isNaN(num)) return 'KSH 0.00';
    return 'KSH ' + num.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatStock(kg, nguniaSize) {
    const size = nguniaSize || DEFAULT_NGUNIA_KG;
    const stockKg = Number(kg) || 0;
    
    if (stockKg <= 0) return '0 kg (Out of Stock)';
    
    const ngunias = Math.floor(stockKg / size);
    const remainder = stockKg % size;
    
    if (ngunias === 0) {
        return `${remainder.toFixed(2)} kg`;
    } else if (remainder === 0) {
        return `${ngunias} ngunia${ngunias > 1 ? 's' : ''} (${stockKg} kg)`;
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

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = 'notification notification-' + (type || 'info');
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
    db, 
    productsRef, categoriesRef, salesRef, stockLogRef, settingsRef, auditLogRef,
    verifyPassword, updatePassword, checkAuth, logout, saveSession,
    getProducts, getProductsRealtime, updateStock, completeSale,
    getSettings, logAudit,
    formatCurrency, formatStock, formatDate,
    showNotification, showConfirm,
    APP_VERSION, DEFAULT_NGUNIA_KG
};

console.log('✅ Bashan POS Core Loaded - Version', APP_VERSION);
