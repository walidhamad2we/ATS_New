import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// تهيئة متغير لـ Google APIs لقراءته ديناميكياً
let google: any;

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log(`[Server] Starting on port ${PORT}...`);

  // Health / Test routes
  app.get("/health", (req, res) => res.json({ status: "up", node: process.version }));
  app.get("/ping", (req, res) => res.send("pong"));

  app.use(express.json({ limit: "50mb" }));

  let lastObservedHost = "https://ais-dev-bb5wgbpc7miiuzfokbkkk7-426220485262.europe-west2.run.app";

  const getRequestHost = (req?: any): string => {
    if (req) {
      const xForwardedHost = req.headers["x-forwarded-host"];
      if (xForwardedHost && typeof xForwardedHost === "string") {
        let hostChoice = xForwardedHost.split(",")[0].trim();
        if (hostChoice && !hostChoice.includes("localhost:3000") && !hostChoice.includes("127.0.0.1")) {
          const protocol = req.headers["x-forwarded-proto"] === "https" || req.secure ? "https" : "http";
          lastObservedHost = `${protocol}://${hostChoice}`;
          return lastObservedHost;
        }
      }

      const referer = req.headers.referer || req.headers.origin;
      if (referer && typeof referer === "string") {
        try {
          const parsed = new URL(referer);
          if (parsed.host && !parsed.host.includes("localhost:3000") && !parsed.host.includes("127.0.0.1")) {
            lastObservedHost = `${parsed.protocol}//${parsed.host}`;
            return lastObservedHost;
          }
        } catch (e) {}
      }

      const host = req.get("host");
      if (host && !host.includes("localhost:3000") && !host.includes("127.0.0.1")) {
        const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
        lastObservedHost = `${protocol}://${host}`;
        return lastObservedHost;
      }
    }
    return lastObservedHost;
  };

  // Dynamic host tracker middleware
  app.use((req, res, next) => {
    getRequestHost(req);
    next();
  });

  // Shared Data Directory
  const DATA_DIR = path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }

  const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
  }

  // Cached Google Token persistence
  const GOOGLE_TOKEN_FILE = path.join(DATA_DIR, "google_token.json");
  const saveCachedGoogleToken = (token: string) => {
    try {
      fs.writeFileSync(GOOGLE_TOKEN_FILE, JSON.stringify({ token, savedAt: Date.now() }, null, 2));
    } catch (e) {
      console.error("Failed to write google token to disk:", e);
    }
  };

  const loadCachedGoogleToken = (): { token: string; savedAt: number } | null => {
    try {
      if (fs.existsSync(GOOGLE_TOKEN_FILE)) {
        return JSON.parse(fs.readFileSync(GOOGLE_TOKEN_FILE, "utf-8"));
      }
    } catch (e) {}
    return null;
  };

  const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
  const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
  const USERS_FILE = path.join(DATA_DIR, "users.json");

  const loadData = (file: string) => {
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  const saveData = (file: string, data: any) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };

  const SYNC_LOGS_FILE = path.join(DATA_DIR, "sync_logs.json");

  const logSyncStatus = (studentName: string, regNum: string, status: 'success' | 'failed', error?: string, details?: string) => {
    try {
      let logs = [];
      if (fs.existsSync(SYNC_LOGS_FILE)) {
        try {
          logs = JSON.parse(fs.readFileSync(SYNC_LOGS_FILE, "utf-8")) || [];
        } catch (e) {}
      }
      
      logs.unshift({
        id: Math.random().toString(36).substring(2, 11),
        timestamp: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
        studentName,
        regNum,
        status,
        error: error || null,
        details: details || null
      });

      if (logs.length > 50) {
        logs = logs.slice(0, 50);
      }

      fs.writeFileSync(SYNC_LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (e) {
      console.error("Failed to write sync log:", e);
    }
  };

  const syncToSheets = async (submission: any, accessToken?: string, req?: any) => {
    let clientEmail = "";
    try {
      const { google } = await import("googleapis");
      const { Readable } = await import("stream");
      const settings = loadData(SETTINGS_FILE);
      const activeTemplateId = settings?.activeFormTemplateId;
      const template = settings?.formTemplates?.find((t: any) => t.id === activeTemplateId);
      
      const spreadsheetId = template?.spreadsheetId || settings?.spreadsheetId;
      const fileFolderId = template?.filesFolderId || settings?.googleDriveFolderId;
      
      if (!spreadsheetId) {
        console.warn("[Google Sheets Sync] No spreadsheet ID configured in settings.");
        return;
      }

      let auth: any;
      const localCached = loadCachedGoogleToken();
      
      if (accessToken) {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        auth = oauth2Client;
      } else if (localCached && (Date.now() - localCached.savedAt < 50 * 60 * 1000)) {
        console.log("[Google Sheets/Drive Sync] Authenticating using stored Admin Google token...");
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: localCached.token });
        auth = oauth2Client;
      } else {
        // قراءة مفتاح حساب الخدمة مباشرة من المجلد السري المحلي على السيرفر
        const credentialsPath = path.join(process.cwd(), "Key", "ats-new-46d8e-firebase-adminsdk-fbsvc-2fa0a78d1b.json");
        
        if (!fs.existsSync(credentialsPath)) {
          console.warn("[Google Drive / Sheets Sync] Service account key file missing.");
          logSyncStatus(
            submission.fullName || "حساب تجريبي/زائر",
            submission.registrationNumber || "بدون رقم",
            'failed',
            "عطل في خيارات بيئة السيرفر (مفتاح جوجل الخلفي غير مهيأ)",
            "يرجى التأكد من وجود ملف المفتاح السري في مجلد Key الخاص بالمشروع لتفعيل المزامنة."
          );
          return;
        }

        const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
        clientEmail = credentials.client_email || "";
        
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
          ],
        });
      }
      
      const sheets = google.sheets({ version: 'v4', auth });
      const drive = google.drive({ version: 'v3', auth });

      // Get correct sheet title
      let sheetTitle = "Sheet1";
      try {
        const spreadSheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        sheetTitle = spreadSheetMeta.data.sheets?.[0]?.properties?.title || "Sheet1";
      } catch (metaErr: any) {
        if (metaErr.message?.includes("permission") || metaErr.status === 403) {
          throw metaErr;
        }
        console.warn("Failed to fetch spreadsheet meta, defaulting to Sheet1:", metaErr.message || metaErr);
      }

      // 1. Check & Create form-level and student-level folder on Google Drive
      let studentFolderId = fileFolderId;
      if (fileFolderId) {
        const formName = template?.name || settings?.schoolName || "الاستمارة";
        const folderName = `${submission.registrationNumber}_${submission.fullName}`;
        try {
          let formFolderId = fileFolderId;
          const qForm = `name = '${formName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${fileFolderId}' in parents and trashed = false`;
          const existingForm = await drive.files.list({
            q: qForm,
            fields: 'files(id)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
          if (existingForm.data.files && existingForm.data.files.length > 0) {
            formFolderId = existingForm.data.files[0].id;
          } else {
            const formFolderMeta = {
              name: formName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [fileFolderId]
            };
            const fFormCreated = await drive.files.create({
              requestBody: formFolderMeta,
              fields: 'id',
              supportsAllDrives: true
            });
            formFolderId = fFormCreated.data.id;
          }

          const qStudent = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${formFolderId}' in parents and trashed = false`;
          const existingStudent = await drive.files.list({
            q: qStudent,
            fields: 'files(id)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
          if (existingStudent.data.files && existingStudent.data.files.length > 0) {
            studentFolderId = existingStudent.data.files[0].id;
          } else {
            const studentFolderMeta = {
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [formFolderId]
            };
            const fStudentCreated = await drive.files.create({
              requestBody: studentFolderMeta,
              fields: 'id',
              supportsAllDrives: true
            });
            studentFolderId = fStudentCreated.data.id;
          }
        } catch (folderErr: any) {
          console.error("Failed to manage Google Drive nested folders:", folderErr.message || folderErr);
        }
      }

      // Helper to upload base64/local file to Drive
      const uploadBase64File = async (fileName: string, dataUrl: string, docKey: string) => {
        if (!dataUrl) return "";

        const getFallbackUrl = () => {
          const host = getRequestHost(req);
          return `${host}/api/student-files/${submission.registrationNumber}/${docKey}`;
        };

        if (dataUrl.startsWith("http") && !dataUrl.includes("/api/student-files/")) {
          return dataUrl;
        }

        try {
          let mimeType = "image/png";
          let buffer: Buffer;

          const studentUploadDir = path.join(UPLOADS_DIR, String(submission.registrationNumber));
          let fileFoundOnDisk = false;
          if (fs.existsSync(studentUploadDir)) {
            const files = fs.readdirSync(studentUploadDir);
            const matchedFile = files.find(f => path.parse(f).name === docKey);
            if (matchedFile) {
              const filePath = path.join(studentUploadDir, matchedFile);
              const ext = path.extname(matchedFile).toLowerCase();
              mimeType = ext === ".pdf" ? "application/pdf" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
              buffer = fs.readFileSync(filePath);
              fileFoundOnDisk = true;
            }
          }

          if (!fileFoundOnDisk) {
            if (!dataUrl.startsWith("data:")) {
              return dataUrl;
            }
            const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) return dataUrl;
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
          }

          const fileMetadata = {
            name: fileName,
            parents: studentFolderId ? [studentFolderId] : []
          };
          
          const media = {
            mimeType: mimeType,
            body: Readable.from(buffer)
          };
          
          const gResponse = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
            supportsAllDrives: true
          });
          
          return gResponse.data.webViewLink || `https://drive.google.com/open?id=${gResponse.data.id}`;
        } catch (uploadErrPre: any) {
          const fallbackUrl = getFallbackUrl();
          return fallbackUrl;
        }
      };

      // 2. Upload System Documents
      const updatedDocuments = { ...(submission.documents || {}) };
      const systemDocs = [
        { key: 'personalPhoto', name: 'photo' },
        { key: 'birthCertificate', name: 'birth' },
        { key: 'prepCertificate', name: 'prep' },
        { key: 'parentNationalId', name: 'parent_id' }
      ];

      for (const doc of systemDocs) {
        const dataUrl = submission.documents?.[doc.key];
        if (dataUrl && (dataUrl.startsWith("data:") || dataUrl.includes("/api/student-files/"))) {
          let suffix = "png";
          const studentUploadDir = path.join(UPLOADS_DIR, String(submission.registrationNumber));
          if (fs.existsSync(studentUploadDir)) {
            const files = fs.readdirSync(studentUploadDir);
            const matchedFile = files.find(f => path.parse(f).name === doc.key);
            if (matchedFile) {
              suffix = path.extname(matchedFile).toLowerCase().replace(".", "");
            }
          }
          const fileTitle = `${doc.name}_${submission.registrationNumber}.${suffix}`;
          const driveUrl = await uploadBase64File(fileTitle, dataUrl, doc.key);
          updatedDocuments[doc.key] = driveUrl;
        }
      }

      // 3. Upload Custom Fields
      const customDataWithLinks = { ...(submission.customData || {}) };
      const activeFields = template?.formFields || settings?.formFields || [];
      for (const f of activeFields) {
        if (systemDocs.some(sd => sd.key === f.id)) continue;
        const fieldVal = submission.customData?.[f.id];
        if (fieldVal && typeof fieldVal === 'object') {
          const dataUrl = fieldVal.dataUrl;
          if (dataUrl && (dataUrl.startsWith("data:") || dataUrl.includes("/api/student-files/"))) {
            let suffix = "png";
            const fileTitle = `${f.id}_${submission.registrationNumber}_${fieldVal.name || "file"}`;
            const driveUrl = await uploadBase64File(fileTitle, dataUrl, f.id);
            customDataWithLinks[f.id] = driveUrl;
          }
        }
      }

      // 4. Update local file
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const idx = allSubmissions.findIndex((s: any) => s.id === submission.id);
      if (idx > -1) {
        allSubmissions[idx].documents = updatedDocuments;
        allSubmissions[idx].customData = customDataWithLinks;
        allSubmissions[idx].cloudSynced = true;
        saveData(SUBMISSIONS_FILE, allSubmissions);
      }

      // 5. Columns mapping according to the specified Google Sheet layout
      let headers: string[] = [];
      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A1:Z1`
        });
        headers = headerResponse.data.values?.[0] || [];
      } catch (err) {}

      const statusArabic = submission.status === 'ACCEPTED' ? 'مقبول' : 
                          submission.status === 'REJECTED' ? 'مرفوض نهائياً' : 
                          submission.status === 'REVISION_REQUESTED' ? 'مطلوب تعديل' :
                          submission.status === 'INCOMPLETE' ? 'بيانات ناقصة' : 'قيد المراجعة';

      const normalizeArabic = (str: string): string => {
        if (!str) return "";
        return str.toLowerCase().trim()
          .replace(/[أإآ]/g, "ا")
          .replace(/ة/g, "ه")
          .replace(/ى/g, "ي")
          .replace(/\s+/g, "");
      };

      let rowValues: any[] = [];
      if (headers.length > 0) {
        for (const header of headers) {
          const cleanHeader = String(header || "").trim();
          if (!cleanHeader) { rowValues.push(""); continue; }
          const norm = normalizeArabic(cleanHeader);

          // Mapping files/documents
          if (norm.includes("صوره") && (norm.includes("القومي") || norm.includes("قومي")) && (norm.includes("ولي") || norm.includes("الامر"))) {
            rowValues.push(updatedDocuments.parentNationalId || "");
          } else if ((norm.includes("شخصيه") || norm.includes("طالب")) && norm.includes("صوره") && !norm.includes("ولي")) {
            rowValues.push(updatedDocuments.personalPhoto || "");
          } else if (norm.includes("اعداد") || norm.includes("اتمام") || norm.includes("المرحلهالاعداديه")) {
            rowValues.push(updatedDocuments.prepCertificate || "");
          } else if (norm.includes("ميلاد")) {
            rowValues.push(updatedDocuments.birthCertificate || "");
          }
          // Mapping text metadata
          else if (norm.includes("تسجيل") && !norm.includes("تاريخ")) {
            rowValues.push(submission.registrationNumber || "");
          } else if (norm.includes("الاسمرباعي") || norm.includes("الاسمكامل") || norm === "الاسم" || (norm.includes("اسم") && norm.includes("طالب") && !norm.includes("ولي") && !norm.includes("ام"))) {
            rowValues.push(submission.fullName || "");
          } else if (norm.includes("محافظه")) {
            rowValues.push(submission.province || "");
          } else if (norm.includes("تاريخالميلاد") || norm.includes("تاريخميلاد")) {
            rowValues.push(submission.dob || "");
          } else if ((norm.includes("القومي") || norm.includes("قومي")) && !norm.includes("ولي") && !norm.includes("صوره") && !norm.includes("بطاقه")) {
            rowValues.push(submission.nationalId || "");
          } else if (norm.includes("مجموع") || norm.includes("درجه")) {
            rowValues.push(submission.score || 0);
          }
          // Father Info
          else if (norm.includes("اسم") && (norm.includes("ولي") || norm.includes("الامر") || norm.includes("اب")) && !norm.includes("عمل") && !norm.includes("وظيفه")) {
            rowValues.push(submission.fatherName || "");
          } else if ((norm.includes("عمل") || norm.includes("وظيفه") || norm.includes("مهنه")) && (norm.includes("ولي") || norm.includes("الامر") || norm.includes("اب"))) {
            rowValues.push(submission.fatherJob || submission.fatherWork || submission.customData?.fatherJob || "");
          }
          // Mother Info
          else if (norm.includes("اسم") && (norm.includes("الام") || norm.includes("ام"))) {
            rowValues.push(submission.motherName || submission.customData?.motherName || "");
          } else if ((norm.includes("عمل") || norm.includes("وظيفه") || norm.includes("مهنه")) && (norm.includes("الام") || norm.includes("ام"))) {
            rowValues.push(submission.motherJob || submission.motherWork || submission.customData?.motherJob || "");
          }
          // Contact & Meta
          else if ((norm.includes("موبايل") || norm.includes("هاتف") || norm.includes("تليفون")) && !norm.includes("واتس")) {
            rowValues.push(submission.phone || "");
          } else if (norm.includes("واتس")) {
            rowValues.push(submission.whatsapp || submission.customData?.whatsapp || submission.customData?.whatsApp || "");
          } else if (norm.includes("تقديم") || norm.includes("ارسال") || (norm.includes("تاريخ") && norm.includes("تسجيل"))) {
            rowValues.push(submission.createdAt ? new Date(submission.createdAt).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : (submission.submissionDate || new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })));
          } else if (norm.includes("حاله") || norm.includes("الحاله")) {
            rowValues.push(statusArabic);
          }
          // Custom Form Fields & Fallbacks
          else {
            const matchedField = activeFields.find((f: any) => 
              normalizeArabic(f.label) === norm || 
              normalizeArabic(f.id) === norm || 
              f.label === cleanHeader || 
              f.id === cleanHeader
            );
            
            if (matchedField) {
              const val = customDataWithLinks[matchedField.id];
              if (val && typeof val === 'object') {
                rowValues.push(val.url || val.dataUrl || val.name || JSON.stringify(val));
              } else {
                rowValues.push(val !== undefined && val !== null ? val : "");
              }
            } else {
              const directVal = customDataWithLinks[cleanHeader] || submission[cleanHeader] || customDataWithLinks[norm] || submission[norm];
              rowValues.push(directVal ? (typeof directVal === 'object' ? JSON.stringify(directVal) : directVal) : "");
            }
          }
        }
      } else {
        rowValues = [submission.registrationNumber, submission.fullName, submission.province, statusArabic];
      }

      // 6. Check duplicates & Save
      let rowIndex = -1;
      try {
        const checkResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetTitle}!A:A` });
        rowIndex = (checkResp.data.values || []).findIndex((r: any) => String(r[0] || "").trim() === String(submission.registrationNumber).trim());
      } catch (err) {}

      if (rowIndex >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetTitle}!A${rowIndex + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowValues] }
        });
        logSyncStatus(submission.fullName, submission.registrationNumber, 'success', undefined, `تم تحديث السطر ${rowIndex + 1} في جوجل شيت.`);
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetTitle}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowValues] },
        });
        logSyncStatus(submission.fullName, submission.registrationNumber, 'success', undefined, "تمت إضافة سجل جديد بنجاح في جوجل شيت.");
      }
    } catch (e: any) {
      logSyncStatus(submission.fullName || "مترشح", submission.registrationNumber || "بدون رقم", 'failed', e.message);
    }
  };

  // API Routes
  app.get("/api/submissions", (req, res) => {
    res.json(loadData(SUBMISSIONS_FILE) || []);
  });

  app.get("/api/sync-logs", (req, res) => {
    try {
      if (fs.existsSync(SYNC_LOGS_FILE)) {
        return res.json(JSON.parse(fs.readFileSync(SYNC_LOGS_FILE, "utf-8")) || []);
      }
    } catch (e) {}
    res.json([]);
  });

  app.post("/api/save-google-token", (req, res) => {
    const { token } = req.body || {};
    if (token) {
      saveCachedGoogleToken(token);
    }
    res.json({ success: true });
  });

  app.get("/api/student-files/:regNum/:docKey", (req, res) => {
    try {
      const { regNum, docKey } = req.params;
      const studentUploadDir = path.join(UPLOADS_DIR, String(regNum));
      if (fs.existsSync(studentUploadDir)) {
        const files = fs.readdirSync(studentUploadDir);
        const matchedFile = files.find(f => path.parse(f).name === docKey);
        if (matchedFile) {
          const filePath = path.join(studentUploadDir, matchedFile);
          res.setHeader("Content-Type", path.extname(matchedFile) === ".pdf" ? "application/pdf" : "image/jpeg");
          return res.sendFile(filePath);
        }
      }
      return res.status(404).send("File not found");
    } catch (err) {
      return res.status(500).send("Error");
    }
  });

  // 📌 معالجة الجزء المقطوع لـ POST /api/submissions وحفظ الملفات محلياً
  app.post("/api/submissions", async (req, res) => {
    try {
      const submission = req.body;
      const regNum = submission.registrationNumber;
      if (!regNum) {
        return res.status(400).json({ error: "Missing registrationNumber" });
      }

      const studentUploadDir = path.join(UPLOADS_DIR, String(regNum));
      if (!fs.existsSync(studentUploadDir)) {
        fs.mkdirSync(studentUploadDir, { recursive: true });
      }

      // حفظ الـ Base64 كملفات في السيرفر المحلي
      if (submission.documents) {
        for (const key of Object.keys(submission.documents)) {
          const val = submission.documents[key];
          if (val && typeof val === "string" && val.startsWith("data:")) {
            const matches = val.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const ext = matches[1].includes("pdf") ? ".pdf" : ".jpg";
              const buffer = Buffer.from(matches[2], "base64");
              fs.writeFileSync(path.join(studentUploadDir, `${key}${ext}`), buffer);
            }
          }
        }
      }

      // حفظ البيانات محلياً في ملف JSON الرئيسي للمنظومة
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const index = allSubmissions.findIndex((s: any) => s.registrationNumber === regNum);
      if (index >= 0) {
        allSubmissions[index] = { ...allSubmissions[index], ...submission, updatedAt: Date.now() };
      } else {
        allSubmissions.push({ ...submission, id: Math.random().toString(36).substring(2, 11), createdAt: Date.now() });
      }
      saveData(SUBMISSIONS_FILE, allSubmissions);

      // تشغيل المزامنة السحابية فوراً في الخلفية (Background Sync) دون تعطيل المستخدم
      syncToSheets(submission, undefined, req).catch(err => console.error("Async sync failed:", err));

      res.json({ success: true, message: "تم استقبال وتأمين الطلب بنجاح وجاري المزامنة السحابية..." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 Full-stack Server is running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);