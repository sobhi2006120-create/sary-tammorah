// server.js - Google Sheets API Proxy Server

const express = require('express');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 3000;

// تحميل config.json (يجب أن يكون الملف داخل مجلد js)
const config = require('./js/config.js');

// إعداد Google Auth مع Service Account
const auth = new google.auth.JWT(
  config.SERVICE_ACCOUNT.client_email,
  null,
  config.SERVICE_ACCOUNT.private_key.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

// دالة المساعدة للحصول على التوكن
async function getAuth() {
  const tokens = await auth.authorize();
  return tokens.access_token;
}

// مساعدة إضافة header التوثيق
function authMiddleware(req, res, next) {
  getAuth()
    .then(token => {
      req.headers['authorization'] = `Bearer ${token}`;
      next();
    })
    .catch(err => {
      console.error('خطأ في المصادقة:', err);
      res.status(500).json({ error: 'فشل المصادقة' });
    });
}

// Enable CORS for both browser and frontend
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Middleware الأساسي: تأكد من توثيق الطلبات
const requireAuth = (req, res, next) => {
  authMiddleware(req, res, next);
  return next();
};

// مسار وسيط بسيط للصحة والأداء
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// مساعدة للاتصال بـ Google Sheets API
async function sheetsRequest(method, resource, path, body = null) {
  const token = await getAuth();

  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`, 
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(resource + path, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets API ${response.status}: ${errorText}`);
  }

  return response.json();
}

// API Routes

// GET /api/sheets - الحصول على جميع الأوراق/التبويبات
app.get('/api/sheets', requireAuth, async (req, res) => {
  try {
    const data = await sheetsRequest('GET', 'https://sheets.googleapis.com/v4/spreadsheets/', `/spreadsheets/${config.SPREADSHEET_ID}?fields=sheets.properties.title`);
    res.json(data.sheets.map(s => s.properties.title));
  } catch (error) {
    console.error('خطأ في جلب الصفحات:', error);
    res.status(500).json({ error: 'فشل جلب الصفحات' });
  }
});

// GET /api/data?sheet=SheetName - قراءة ورقة محددة
app.get('/api/data', requireAuth, async (req, res) => {
  const { sheet } = req.query;
  if (!sheet) {
    return res.status(400).json({ error: 'معرف الورقة مطلوب' });
  }

  try {
    const data = await sheetsRequest('GET', 'https://sheets.googleapis.com/v4/spreadsheets/', `/spreadsheets/${config.SPREADSHEET_ID}/values/${encodeURIComponent(sheet)}`);
    res.json({
      headers: data.values ? data.values[0] : [],
      rows: data.values ? data.values.slice(1) : []
    });
  } catch (error) {
    console.error(`خطأ في جلب البيانات من '${sheet}':`, error);
    res.status(500).json({ error: 'فشل جلب البيانات' });
  }
});

// POST /api/data - إضافة صف جديد
app.post('/api/data', requireAuth, async (req, res) => {
  const { sheet, values } = req.body;

  if (!sheet || !values || !Array.isArray(values)) {
    return res.status(400).json({ error: 'معرف الورقة والمصفوفة الصحيحة مطلوبة' });
  }

  try {
    const data = await sheetsRequest('POST', 'https://sheets.googleapis.com/v4/spreadsheets/', `/spreadsheets/${config.SPREADSHEET_ID}/values/${encodeURIComponent(sheet)}!A:Z:append`, {
      values: [values],
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS'
    });
    res.json(data);
  } catch (error) {
    console.error(`خطأ في إضافة البيانات إلى '${sheet}':`, error);
    res.status(500).json({ error: 'فشل إضافة البيانات' });
  }
});

// API لـ Excel compatible: read/write via /api/excel
app.post('/api/excel', requireAuth, async (req, res) => {
  const { sheet, columns, rows } = req.body;

  if (!sheet || !columns || !rows) {
    return res.status(400).json({ error: 'معرف الورقة والأعمدة والصفوف مطلوبة' });
  }

  // الحصول على الأعمدة الحالية أولاً (أو محاولة إنشائها)
  try {
    const data = await sheetsRequest('GET', 'https://sheets.googleapis.com/v4/spreadsheets/', `/spreadsheets/${config.SPREADSHEET_ID}/values/${encodeURIComponent(sheet)}`);

    const current = data.values || [];

    // الحفاظ على الصفوف الموجودة (إذا كانت موجودة)
    const newValues = current.slice(); // استخدام slice لإنشاء نسخة

    // إدراج الأعمدة الجديدة في السطر الأول (إذا لم تكن موجودة)
    if (!current.length) newValues.push(columns);
    else if (current[0].length < columns.length) {
      for (let i = 0; i < columns.length - current[0].length; i++) {
        newValues[0].push(`"${columns[current[0].length + i]}" );
      }
    }

    // إضافة صفوف البيانات
    rows.forEach(row => {
      newValues.push(row);
    });

    // كتابة جميع البيانات مرة واحدة
    await sheetsRequest('PUT', 'https://sheets.googleapis.com/v4/spreadsheets/', `/spreadsheets/${config.SPREADSHEET_ID}/values/${encodeURIComponent(sheet)}`, {
      values: newValues,
      valueInputOption: 'USER_ENTERED'
    });

    res.json({ success: true, updated: rows.length });
  } catch (error) {
    console.error(`خطأ في المعالجة المتوافقة مع Excel '${sheet}':`, error);
    res.status(500).json({ error: 'فشل عملية المعالجة مع Excel' });
  }
});

// مسار محاكاة Google Cloud for local dev (عندما لا يكون GOOGLE_APPLICATION_CREDENTIALS موجوداً)
app.get('/google-credentials-sample', (req, res) => {
  res.json(config.SERVICE_ACCOUNT);
});

// خدمة الملفات الثابتة (للبيئة الإنتاج)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('public'));
} else {
  // في التطوير، نخدم الملفات من جذر المشروع
  app.use(express.static(__dirname));
}

// اص.Handle غير متوقع / catch-all for صفحة 404 النهائية
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// بدء الخادم
app.listen(PORT, () => {
  console.log(`🟢サーバー开始: http://localhost:${PORT}`);
  console.log(`📂 خدمة الملفات الثابتة: ${__dirname}`);
  console.log(`🔑 المصادقة: Service Account ${config.SERVICE_ACCOUNT.client_email}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('رفضت Promise غير معالج:', reason);
});

module.exports = app;
