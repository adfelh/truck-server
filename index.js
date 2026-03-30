// استيراد المكتبات المطلوبة
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// إنشاء تطبيق Express
const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الـ CORS للسماح لتطبيق Electron بالاتصال
app.use(cors({
    origin: '*', // في الإنتاج، حدد رابط تطبيقك فقط
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
}));

// قراءة البيانات بصيغة JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مسار حفظ البيانات (سنستخدم ملفات JSON مؤقتاً)
const DATA_PATH = path.join(__dirname, 'data');

// التأكد من وجود مجلد البيانات
if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH);
}

// ====================== نقاط النهاية (Endpoints) ======================

// 1. نقطة اختبار (هل الخادم يعمل؟)
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 خادم API يعمل بنجاح!',
        version: '1.0.0',
        endpoints: {
            test: '/',
            sync: '/api/sync',
            getData: '/api/get-data',
            status: '/api/status'
        }
    });
});

// 2. حالة الخادم
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        status: 'online',
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
        console.log('📊 حجم البيانات:', JSON.stringify(data).length, 'بايت');

        // حفظ البيانات المستلمة في ملف (مؤقتاً)
        const fileName = `sync_${Date.now()}_${clientId}.json`;
        const filePath = path.join(DATA_PATH, fileName);

        fs.writeFileSync(filePath, JSON.stringify({
            receivedAt: new Date().toISOString(),
            clientId,
            timestamp,
            data
        }, null, 2));

        res.json({
            success: true,
            message: 'تم استلام البيانات بنجاح',
            savedTo: fileName,
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

// 4. إرسال البيانات إلى تطبيق Electron (جلب البيانات)
app.get('/api/get-data', (req, res) => {
    try {
        // هنا سنقرأ جميع الملفات المحفوظة (مثال)
        const files = fs.readdirSync(DATA_PATH);
        const allData = [];

        files.forEach(file => {
            if (file.endsWith('.json')) {
                const filePath = path.join(DATA_PATH, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                allData.push(JSON.parse(content));
            }
        });

        res.json({
            success: true,
            message: 'تم جلب البيانات بنجاح',
            data: allData,
            totalFiles: files.length,
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

// 5. نقطة خاصة لاختبار الاتصال
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

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 خادم API يعمل بنجاح!');
    console.log(`📡 الرابط المحلي: http://localhost:${PORT}`);
    console.log(`🌐 الرابط الخارجي: https://your-app.onrender.com`);
    console.log(`📅 وقت التشغيل: ${new Date().toLocaleString('ar-LY')}`);
    console.log('='.repeat(50));
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ خطأ في Promise:', error);
});