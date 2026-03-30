// استيراد المكتبات المطلوبة
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

// إنشاء تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الـ CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================== الاتصال بقاعدة البيانات ======================
let pool;

async function initDatabase() {
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: {
                rejectUnauthorized: false
            }
        });

        // اختبار الاتصال
        const connection = await pool.getConnection();
        console.log('✅ تم الاتصال بقاعدة البيانات بنجاح!');
        connection.release();

        return true;
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
        return false;
    }
}

// ====================== نقاط النهاية (Endpoints) ======================

// 1. نقطة اختبار
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم API يعمل بنجاح مع قاعدة البيانات!',
        version: '2.0.0',
        database: process.env.DB_NAME || 'connected',
        endpoints: {
            test: '/',
            sync: '/api/sync',
            getData: '/api/get-data',
            status: '/api/status',
            products: '/api/products'
        }
    });
});

// 2. حالة الخادم وقاعدة البيانات
app.get('/api/status', async (req, res) => {
    let dbStatus = 'disconnected';

    try {
        if (pool) {
            const connection = await pool.getConnection();
            await connection.ping();
            connection.release();
            dbStatus = 'connected';
        }
    } catch (error) {
        dbStatus = 'error: ' + error.message;
    }

    res.json({
        success: true,
        status: 'online',
        database: dbStatus,
        timestamp: new Date().toISOString(),
        serverTime: new Date().toLocaleString('ar-LY')
    });
});

// 3. استقبال البيانات من تطبيق Electron (رفع البيانات)
app.post('/api/sync', async (req, res) => {
    try {
        const { data, timestamp, clientId } = req.body;

        console.log('📥 تم استلام بيانات من جهاز:', clientId);
        console.log('📅 وقت الاستلام:', timestamp);

        if (!pool) {
            throw new Error('قاعدة البيانات غير متصلة');
        }

        // حفظ البيانات في جدول sync_log (أنشئ الجدول أولاً)
        const [result] = await pool.execute(
            'INSERT INTO sync_log (client_id, sync_data, sync_time) VALUES (?, ?, ?)',
            [clientId, JSON.stringify(data), new Date(timestamp || Date.now())]
        );

        res.json({
            success: true,
            message: 'تم استلام البيانات بنجاح',
            syncId: result.insertId,
            receivedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ خطأ في استقبال البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء معالجة البيانات',
            error: error.message
        });
    }
});

// 4. جلب البيانات من قاعدة البيانات (للمزامنة)
app.get('/api/get-data', async (req, res) => {
    try {
        if (!pool) {
            throw new Error('قاعدة البيانات غير متصلة');
        }

        // جلب جميع المنتجات
        const [products] = await pool.execute('SELECT * FROM products');

        // جلب العملاء
        const [customers] = await pool.execute('SELECT * FROM customers');

        // جلب الفواتير
        const [invoices] = await pool.execute('SELECT * FROM invoices');

        res.json({
            success: true,
            message: 'تم جلب البيانات بنجاح',
            data: {
                products,
                customers,
                invoices,
                lastSync: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ خطأ في جلب البيانات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب البيانات',
            error: error.message
        });
    }
});

// 5. جلب جميع المنتجات
app.get('/api/products', async (req, res) => {
    try {
        if (!pool) {
            throw new Error('قاعدة البيانات غير متصلة');
        }

        const [products] = await pool.execute('SELECT * FROM products ORDER BY id DESC');

        res.json({
            success: true,
            count: products.length,
            data: products
        });

    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 6. إضافة منتج جديد
app.post('/api/products', async (req, res) => {
    try {
        const { name, price, quantity, category } = req.body;

        if (!pool) {
            throw new Error('قاعدة البيانات غير متصلة');
        }

        const [result] = await pool.execute(
            'INSERT INTO products (name, price, quantity, category, created_at) VALUES (?, ?, ?, ?, NOW())',
            [name, price, quantity, category]
        );

        res.json({
            success: true,
            message: 'تم إضافة المنتج بنجاح',
            productId: result.insertId
        });

    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 7. تحديث منتج
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, quantity, category } = req.body;

        const [result] = await pool.execute(
            'UPDATE products SET name=?, price=?, quantity=?, category=? WHERE id=?',
            [name, price, quantity, category, id]
        );

        res.json({
            success: true,
            message: 'تم تحديث المنتج بنجاح',
            affectedRows: result.affectedRows
        });

    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 8. حذف منتج
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute('DELETE FROM products WHERE id=?', [id]);

        res.json({
            success: true,
            message: 'تم حذف المنتج بنجاح',
            affectedRows: result.affectedRows
        });

    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// 9. اختبار الاتصال
app.post('/api/test', (req, res) => {
    console.log('📡 طلب اختبار:', req.body);
    res.json({
        success: true,
        message: 'الاتصال ناجح!',
        receivedData: req.body,
        serverResponse: 'تم استلام طلبك بنجاح ✅'
    });
});

// ====================== تشغيل الخادم ======================

// تهيئة قاعدة البيانات أولاً ثم تشغيل الخادم
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log('='.repeat(50));
        console.log('🚀 خادم API يعمل بنجاح!');
        console.log(`📡 الرابط المحلي: http://localhost:${PORT}`);
        console.log(`🌐 الرابط الخارجي: https://truck-server.onrender.com`);
        console.log(`🗄️  قاعدة البيانات: ${process.env.DB_NAME || 'local'}`);
        console.log(`📅 وقت التشغيل: ${new Date().toLocaleString('ar-LY')}`);
        console.log('='.repeat(50));
    });
}).catch(error => {
    console.error('❌ فشل تهيئة قاعدة البيانات:', error);
    // استمر في التشغيل حتى مع فشل قاعدة البيانات
    app.listen(PORT, () => {
        console.log('⚠️ خادم يعمل بدون قاعدة بيانات');
    });
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ خطأ في Promise:', error);
});