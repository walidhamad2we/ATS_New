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

// Move large imports to top level but only if needed
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
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
          console.warn("[Google Drive / Sheets Sync] GOOGLE_APPLICATION_CREDENTIALS_JSON and valid cached Google token are both missing.");
          logSyncStatus(
            submission.fullName || "حساب تجريبي/زائر",
            submission.registrationNumber || "بدون رقم",
            'failed',
            "عطل في خيارات بيئة السيرفر (مفتاح جوجل الخلفي غير مهيأ)",
            "يرجى تسجيل الدخول بحساب جوجل لتنشيط جلسة المؤقتة للمشرف، أو قم بتهيئة ملف حساب الخدمة المعتمد GOOGLE_APPLICATION_CREDENTIALS_JSON في خيارات البيئة لتمكين المزامنة التلقائية 24/7."
          );
          return;
        }
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
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
          // A. Locate or create the "Form Name" folder inside the main fileFolderId
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

          // B. Locate or create the "RegistrationNumber_FullName" folder inside formFolderId
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

        // If it is already a Google Drive link, return it as is
        if (dataUrl.startsWith("http") && !dataUrl.includes("/api/student-files/")) {
          return dataUrl;
        }

        try {
          let mimeType = "image/png";
          let buffer: Buffer;

          // Check if file exists on disk
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
            // Fallback: parse base64 if it is a dataUrl
            if (!dataUrl.startsWith("data:")) {
              return dataUrl; // return whatever it is
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
          const errMsg = uploadErrPre.message || String(uploadErrPre);
          console.error(`Failed to upload file ${fileName} for ${submission.registrationNumber}:`, errMsg);
          
          const fallbackUrl = getFallbackUrl();
          console.log(`Fallback URL activated due to upload error: ${fallbackUrl}`);
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
              const ext = path.extname(matchedFile).toLowerCase();
              suffix = ext.replace(".", "");
            }
          }
          if (suffix === "png") {
            if (dataUrl.includes("application/pdf")) suffix = "pdf";
            else if (dataUrl.includes("image/jpeg")) suffix = "jpg";
          }
          
          const fileTitle = `${doc.name}_${submission.registrationNumber}.${suffix}`;
          const driveUrl = await uploadBase64File(fileTitle, dataUrl, doc.key);
          updatedDocuments[doc.key] = driveUrl;
        }
      }

      // 3. Upload Custom Fields (if they are files)
      const customDataWithLinks = { ...(submission.customData || {}) };
      const activeFields = template?.formFields || settings?.formFields || [];
      for (const f of activeFields) {
        if (systemDocs.some(sd => sd.key === f.id)) continue;
        const fieldVal = submission.customData?.[f.id];
        if (fieldVal && typeof fieldVal === 'object') {
          const dataUrl = fieldVal.dataUrl;
          if (dataUrl && (dataUrl.startsWith("data:") || dataUrl.includes("/api/student-files/"))) {
            let suffix = "png";
            
            const studentUploadDir = path.join(UPLOADS_DIR, String(submission.registrationNumber));
            if (fs.existsSync(studentUploadDir)) {
              const files = fs.readdirSync(studentUploadDir);
              const matchedFile = files.find(file => path.parse(file).name === f.id);
              if (matchedFile) {
                const ext = path.extname(matchedFile).toLowerCase();
                suffix = ext.replace(".", "");
              }
            }
            if (suffix === "png") {
              if (fieldVal.type?.includes("pdf")) suffix = "pdf";
              else if (fieldVal.type?.includes("jpeg") || fieldVal.type?.includes("jpg")) suffix = "jpg";
            }
            
            const fileTitle = `${f.id}_${submission.registrationNumber}_${fieldVal.name || "file"}`;
            const driveUrl = await uploadBase64File(fileTitle, dataUrl, f.id);
            customDataWithLinks[f.id] = driveUrl;
          }
        }
      }

      // 4. Update the saved local submission with URLs (cleaning the submissions.json file)
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const idx = allSubmissions.findIndex((s: any) => s.id === submission.id);
      if (idx > -1) {
        allSubmissions[idx].documents = updatedDocuments;
        allSubmissions[idx].customData = customDataWithLinks;
        allSubmissions[idx].cloudSynced = true;
        saveData(SUBMISSIONS_FILE, allSubmissions);
        console.log(`[Server] Succeeded in transferring local base64 files to Cloud links for student ${submission.fullName}`);
      }

      // 5. Query columns and write exact mapped row to Google Sheets (Safe/Dynamic columns matching)
      let headers: string[] = [];
      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A1:Z1`
        });
        headers = headerResponse.data.values?.[0] || [];
      } catch (err: any) {
        console.warn("Could not fetch Google Sheet headers dynamically, falling back to static schema mapping:", err.message || err);
      }

      // Safe mapping translated to Arabic statuses
      const statusArabic = submission.status === 'ACCEPTED' ? 'مقبول' : 
                          submission.status === 'REJECTED' ? 'مرفوض نهائياً' : 
                          submission.status === 'REVISION_REQUESTED' ? 'مطلوب تعديل' :
                          submission.status === 'INCOMPLETE' ? 'بيانات ناقصة' : 'قيد المراجعة';

      // Helper to normalize Arabic strings for fuzzy robust matching
      const normalizeArabic = (str: string): string => {
        if (!str) return "";
        return str
          .toLowerCase()
          .trim()
          .replace(/[أإآ]/g, "ا")
          .replace(/ة/g, "ه")
          .replace(/ى/g, "ي")
          .replace(/\s+/g, "")
          .replace(/[^\w\u0600-\u06FF]/g, "");
      };

      let rowValues: any[] = [];
      if (headers.length > 0) {
        for (const header of headers) {
          const cleanHeader = String(header || "").trim();
          if (!cleanHeader) {
            rowValues.push("");
            continue;
          }

          const norm = normalizeArabic(cleanHeader);

          // 1. Parent National ID JPG Image Check
          // Matches e.g. "صورة الرقم القومي لولي الأمر" or "صوره بطاقه الرقم القومي لولي الامر" or "مرفق الرقم القومي لولي الامر"
          // Must contain a file descriptor ("صوره", "بطاقه", "هويه", "ملف", "مرفق", "رابط") AND "قومي" AND ("ولي" or "الامر")
          const isParentIdImg = (norm.includes("صوره") || norm.includes("بطاقه") || norm.includes("هويه") || norm.includes("ملف") || norm.includes("مرفق") || norm.includes("رابط") || norm.includes("تحميل")) &&
                                (norm.includes("القومي") || norm.includes("قومي") || norm.includes("بطاقه") || norm.includes("هويه")) &&
                                (norm.includes("ولي") || norm.includes("الامر"));

          // 2. Student Personal Photo JPG Check
          // Matches "صورة شخصية للطالب", "صوره شخصيه", "صورة الطالب"
          // Must contain "شخصيه" or "طالب" or "صورهطالب" AND "صوره"
          // AND must NOT contain parent-related keywords or secondary school keywords
          const isPersonalPhotoImg = (norm.includes("شخصيه") || norm.includes("طالب") || (norm.includes("صوره") && norm.includes("طالب"))) &&
                                     !norm.includes("ولي") && !norm.includes("الامر") && !norm.includes("ميلاد") &&
                                     !norm.includes("اعداد") && !norm.includes("اتمام");

          // 3. Prep/Middle School Certificate Check (Secondary/middle certificate file)
          // Matches "شهادة إتمام المرحلة الإعدادية" or "صورة شهادة إعدادية"
          // Since "اعداد" is completely specific to prep certificate, we require "اعداد" or "اتمام"
          const isPrepCertificateImg = norm.includes("اعداد") || norm.includes("اتمام") || norm.includes("شهادهاتمام");

          // 4. Birth Certificate IMG Check
          // Matches "شهادة الميلاد" or "شهاده الميلاد" or "الميلاد"
          const isBirthCertificateImg = norm.includes("ميلاد");

          if (isParentIdImg) {
            rowValues.push(updatedDocuments.parentNationalId || "");
          } else if (isPersonalPhotoImg) {
            rowValues.push(updatedDocuments.personalPhoto || "");
          } else if (isPrepCertificateImg) {
            rowValues.push(updatedDocuments.prepCertificate || "");
          } else if (isBirthCertificateImg) {
            rowValues.push(updatedDocuments.birthCertificate || "");
          } else if (norm.includes("تسجيل") && !norm.includes("تاريخ") && !norm.includes("وقت")) {
            rowValues.push(submission.registrationNumber || "");
          } else if ((norm.includes("الاسمرباعي") || norm.includes("الاسمكامل") || norm === "الاسم" || norm === "اسم" || (norm.includes("اسم") && norm.includes("طالب")) || (norm.includes("الاسم") && !norm.includes("ولي") && !norm.includes("الامر") && !norm.includes("الام") && !norm.includes("اب") && !norm.includes("صوره") && !norm.includes("شهاده") && !norm.includes("ملف") && !norm.includes("مرفق") && !norm.includes("رابط")))) {
            rowValues.push(submission.fullName || "");
          } else if (norm.includes("محافظه")) {
            rowValues.push(submission.province || "");
          } else if (norm.includes("تاريخالميلاد") || norm.includes("تاريخميلاد") || norm.includes("تاريخالولاده") || (norm.includes("تاريخ") && norm.includes("ميلاد"))) {
            rowValues.push(submission.dob || "");
          } else if ((norm.includes("القومي") || norm.includes("قومي")) && !norm.includes("ولي") && !norm.includes("الامر") && !norm.includes("صوره") && !norm.includes("بطاقه") && !norm.includes("هويه") && !norm.includes("ملف") && !norm.includes("مرفق") && !norm.includes("رابط")) {
            rowValues.push(submission.nationalId || "");
          } else if (norm.includes("مجموع") || norm.includes("درجه") || norm === "المجموع") {
            rowValues.push(submission.score || 0);
          } else if (norm.includes("اسم") && (norm.includes("ولي") || norm.includes("الامر") || norm.includes("اب")) && !norm.includes("وظيفه") && !norm.includes("عمل") && !norm.includes("مهنه") && !norm.includes("الرقم") && !norm.includes("القومي")) {
            rowValues.push(submission.fatherName || "");
          } else if ((norm.includes("ولي") || norm.includes("الامر") || norm.includes("اب")) && (norm.includes("وظيفه") || norm.includes("عمل") || norm.includes("مهنه"))) {
            rowValues.push(submission.fatherJob || "");
          } else if (norm.includes("اسم") && (norm.includes("الام") || norm.includes("ام")) && !norm.includes("عمل") && !norm.includes("وظيفه") && !norm.includes("مهنه")) {
            rowValues.push(submission.motherName || "");
          } else if ((norm.includes("الام") || norm.includes("ام")) && (norm.includes("وظيفه") || norm.includes("عمل") || norm.includes("مهنه"))) {
            rowValues.push(submission.motherJob || "");
          } else if (norm.includes("موبايل") || norm.includes("هاتف") || norm.includes("تليفون") || norm.includes("واتس") || norm.includes("اتصال")) {
            rowValues.push(submission.phone || "");
          } else if (norm.includes("تاريخالتقديم") || norm.includes("تاريختقديم") || norm.includes("تاريخالتسجيل") || (norm.includes("تاريخ") && (norm.includes("تقديم") || norm.includes("ارسال")))) {
            rowValues.push(submission.createdAt ? new Date(submission.createdAt).toLocaleString('ar-EG') : new Date().toLocaleString('ar-EG'));
          } else if (norm.includes("حاله") || norm.includes("الحاله")) {
            rowValues.push(statusArabic);
          } else {
            const matchedField = activeFields.find((f: any) => f.label === cleanHeader || f.id === cleanHeader);
            if (matchedField) {
              const val = customDataWithLinks[matchedField.id];
              if (val && typeof val === 'object') {
                rowValues.push(val.url || val.name || JSON.stringify(val));
              } else {
                rowValues.push(val || "");
              }
            } else {
              const directVal = customDataWithLinks[cleanHeader] || submission[cleanHeader];
              rowValues.push(directVal ? (typeof directVal === 'object' ? JSON.stringify(directVal) : directVal) : "");
            }
          }
        }
      } else {
        // Fallback row format
        rowValues = [
          submission.registrationNumber,
          submission.fullName,
          submission.province,
          submission.dob,
          submission.nationalId,
          submission.score,
          submission.fatherName,
          submission.fatherJob,
          submission.motherName,
          submission.motherJob,
          submission.phone,
          new Date().toLocaleString('ar-EG'),
          statusArabic,
          updatedDocuments.birthCertificate || "",
          updatedDocuments.personalPhoto || "",
          updatedDocuments.prepCertificate || "",
          updatedDocuments.parentNationalId || ""
        ];
      }

      // 6. Check if registration number already exists in Google Sheet to prevent duplicate rows
      let rowIndex = -1;
      try {
        const checkResp = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A:A`
        });
        const rows = checkResp.data.values || [];
        rowIndex = rows.findIndex((r: any) => String(r[0] || "").trim() === String(submission.registrationNumber).trim());
      } catch (checkErr: any) {
        console.warn("Failed checking for duplicate registration row:", checkErr.message || checkErr);
      }

      if (rowIndex >= 0) {
        // Update existing row
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetTitle}!A${rowIndex + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowValues] }
        });
        console.log(`[Google Sheets] Succeeded in UPDATING row ${rowIndex + 1} for pupil: ${submission.registrationNumber}`);
        logSyncStatus(submission.fullName, submission.registrationNumber, 'success', undefined, `تم تحديث السطر ${rowIndex + 1} بنجاح في جدول البيانات السحابي.`);
      } else {
        // Append new row
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetTitle}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowValues] },
        });
        console.log(`[Google Sheets] Succeeded in APPENDING new row for pupil: ${submission.registrationNumber}`);
        logSyncStatus(submission.fullName, submission.registrationNumber, 'success', undefined, "تمت إضافة سجل جديد بنجاح في جدول البيانات السحابي.");
      }

    } catch (e: any) {
      let errStr = e.message || String(e);
      let details = "";
      if (e.message?.includes("permission") || e.status === 403) {
        errStr = "تم رفض إذن الوصول (Permission Denied / 403)";
        details = `يرجى فتح ملف Google Sheets والمجلد الخاص بك، والضغط على مشاركة (Share) وإضافة بريد الروبوت التالي كـ Editor (محرر) ليتمكن الموقع من تنزيل البيانات تلقائياً: [ ${clientEmail || "بريد الخدمة السحابية الخاص بك"} ]`;
        console.error(`[Google Sheets Sync Error] PERMISSION DENIED! The spreadsheet has not been shared with the app service account email. 
👉 Please open your Google Sheet, click 'Share' (مشاركة), and add this email as Editor:
   ${clientEmail || "your-google-service-account-email"}
`);
      } else {
        console.error("Sheets Sync Error:", e.message || e);
        details = `تفاصيل الخطأ: ${e.message || "خطأ غير معروف في الاتصال بجوجل شيتس."}`;
      }
      logSyncStatus(submission.fullName || "مترشح زائر", submission.registrationNumber || "بدون رقم", 'failed', errStr, details);
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
      console.log("[Server] Cached fresh admin Google Token from API request.");
    }
    res.json({ success: true });
  });

  app.get("/api/student-files/:regNum/:docKey", (req, res) => {
    try {
      const { regNum, docKey } = req.params;
      const studentUploadDir = path.join(UPLOADS_DIR, String(regNum));
      
      // 1. Check if the file exists physically on disk
      if (fs.existsSync(studentUploadDir)) {
        const files = fs.readdirSync(studentUploadDir);
        const matchedFile = files.find(f => path.parse(f).name === docKey);
        if (matchedFile) {
          const filePath = path.join(studentUploadDir, matchedFile);
          const ext = path.extname(matchedFile).toLowerCase();
          const mimeType = ext === ".pdf" ? "application/pdf" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Content-Disposition", `inline; filename="${matchedFile}"`);
          return res.sendFile(filePath);
        }
      }

      // 2. Otherwise load submission from database for any legacy records
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const submission = allSubmissions.find((s: any) => s.registrationNumber === regNum);
      if (!submission) {
        return res.status(404).send("File not found");
      }
      
      let dataUrl = submission.documents?.[docKey];
      if (!dataUrl) {
        const fieldVal = submission.customData?.[docKey];
        if (fieldVal && typeof fieldVal === 'object') {
          dataUrl = fieldVal.dataUrl || fieldVal.url;
        }
      }

      if (dataUrl && typeof dataUrl === "string") {
        if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
          // Prevent infinite redirect loops if it contains itself
          if (dataUrl.includes(`/api/student-files/${regNum}/${docKey}`)) {
            return res.status(404).send("File not found on disk");
          }
          return res.redirect(dataUrl);
        }
        if (dataUrl.startsWith("data:")) {
          const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const buffer = Buffer.from(matches[2], "base64");
            res.setHeader("Content-Type", mimeType);
            return res.send(buffer);
          }
        }
      }

      return res.status(404).send("File not found");
    } catch (err: any) {
      console.error(err);
      return res.status(500).send("Internal server error");
    }
  });

  app.post("/api/submissions", async (req, res) => {
    try {
      const submission = req.body;
      const regNum = submission.registrationNumber;
      if (!regNum) {
        return res.status(400).json({ error: "Missing registrationNumber" });
      }

      // Create uploads folder for this student
      const studentUploadDir = path.join(UPLOADS_DIR, String(regNum));
      if (!fs.existsSync(studentUploadDir)) {
        fs.mkdirSync(studentUploadDir, { recursive: true });
      }

      const host = getRequestHost(req);

      // Save standard base64 documents to physical files on server disk
      if (submission.documents) {
        for (const key of Object.keys(submission.documents)) {
          const val = submission.documents[key];
          if (val && typeof val === "string" && val.startsWith("data:")) {
            const suffix = val.includes("application/pdf") ? "pdf" : val.includes("image/jpeg") ? "jpg" : "png";
            const matches = val.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const buffer = Buffer.from(matches[2], "base64");
              const filePath = path.join(studentUploadDir, `${key}.${suffix}`);
              fs.writeFileSync(filePath, buffer);
              submission.documents[key] = `${host}/api/student-files/${regNum}/${key}`;
            }
          }
        }
      }

      // Save custom fields base64 files to disk
      if (submission.customData) {
        for (const key of Object.keys(submission.customData)) {
          const val = submission.customData[key];
          if (val && typeof val === "object" && val.dataUrl && val.dataUrl.startsWith("data:")) {
            const suffix = val.type?.includes("pdf") ? "pdf" : val.type?.includes("jpeg") || val.type?.includes("jpg") ? "jpg" : "png";
            const matches = val.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const buffer = Buffer.from(matches[2], "base64");
              const filePath = path.join(studentUploadDir, `${key}.${suffix}`);
              fs.writeFileSync(filePath, buffer);
              submission.customData[key] = {
                ...val,
                dataUrl: `${host}/api/student-files/${regNum}/${key}`
              };
            }
          }
        }
      }

      const all = loadData(SUBMISSIONS_FILE) || [];
      const index = all.findIndex((s: any) => s.id === submission.id);
      if (index > -1) all[index] = { ...all[index], ...submission };
      else all.push(submission);
      
      saveData(SUBMISSIONS_FILE, all);
      
      // Trigger background sync with direct request object passage
      syncToSheets(submission, undefined, req).catch(console.error);
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Failed to process submission:", err);
      res.status(500).json({ error: err.message || "Failed to save submission" });
    }
  });

  app.get("/api/settings", (req, res) => {
    res.json(loadData(SETTINGS_FILE));
  });

  app.get("/api/sheets-info", (req, res) => {
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        return res.json({
          hasCredentials: true,
          clientEmail: credentials.client_email,
          projectId: credentials.project_id
        });
      }
    } catch (e) {}
    res.json({ hasCredentials: false });
  });

  app.get("/api/google-test-connection", async (req, res) => {
    try {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        return res.json({
          status: "missing_credentials",
          message: "لم يتم العثور على مفتاح اعتماد جوجل سحابي (GOOGLE_APPLICATION_CREDENTIALS_JSON) في خيارات البيئة."
        });
      }

      const { google } = await import("googleapis");
      const settings = loadData(SETTINGS_FILE);
      const activeTemplateId = settings?.activeFormTemplateId;
      const template = settings?.formTemplates?.find((t: any) => t.id === activeTemplateId);
      
      const spreadsheetId = template?.spreadsheetId || settings?.spreadsheetId;
      const fileFolderId = template?.filesFolderId || settings?.googleDriveFolderId;
      
      if (!spreadsheetId) {
        return res.json({
          status: "missing_settings",
          message: "لم يتم تحديد معرّف ملف Google Sheets في الإعدادات."
        });
      }

      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive'
        ],
      });
      
      const sheets = google.sheets({ version: 'v4', auth });
      const drive = google.drive({ version: 'v3', auth });

      // 1. Try to read Sheet Meta
      let sheetTitle = "Sheet1";
      try {
        const spreadSheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        sheetTitle = spreadSheetMeta.data.sheets?.[0]?.properties?.title || "Sheet1";
      } catch (sheetErr: any) {
        if (sheetErr.status === 403 || sheetErr.message?.includes("permission")) {
          return res.json({
            status: "permission_denied",
            email: credentials.client_email,
            message: `فشل الوصول للملف: يرجى مشاركة مستند Google Sheet الخاص بك (ID: ${spreadsheetId}) مع البريد الإلكتروني أدناه كـ Editor (محرر):`
          });
        }
        throw sheetErr;
      }

      // 2. Try to verify Drive Folder
      let folderAccess = "no_folder";
      if (fileFolderId) {
        try {
          await drive.files.get({
            fileId: fileFolderId,
            fields: "id, name",
            supportsAllDrives: true
          });
          folderAccess = "success";
        } catch (driveErr: any) {
          folderAccess = "permission_denied";
        }
      }

      return res.json({
        status: "success",
        sheetTitle,
        folderAccess,
        clientEmail: credentials.client_email,
        message: "تم الاتصال بنجاح تام! حساب الخدمة يمتلك الصلاحيات الكاملة للوصول وتعديل ملف Google Sheet ومجلد الدرايف المعينين."
      });

    } catch (e: any) {
      console.error("[Test Connection Error]:", e);
      res.json({
        status: "error",
        message: e.message || "حدث خطأ غير متوقع أثناء اختبار التحقق."
      });
    }
  });

  app.post("/api/sync-all", async (req, res) => {
    try {
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const { googleToken } = req.body || {};
      console.log(`[Server] Manual sync-all triggered for ${allSubmissions.length} applications. Google token provided: ${!!googleToken}`);
      
      let successCount = 0;
      let failCount = 0;
      let lastError = null;

      for (const sub of allSubmissions) {
        try {
          await syncToSheets(sub, googleToken, req);
          successCount++;
        } catch (err: any) {
          console.error(`Failed to sync submission ${sub.registrationNumber}:`, err.message || err);
          failCount++;
          lastError = err.message || err;
        }
      }

      res.json({
        success: true,
        total: allSubmissions.length,
        successCount,
        failCount,
        error: lastError
      });
    } catch (error: any) {
      console.error("Bulk sync error:", error);
      res.status(500).json({ error: error.message || "Bulk sync failed" });
    }
  });

  app.post("/api/simulate-submission", async (req, res) => {
    const logs: string[] = [];
    const log = (msg: string) => {
      const stamp = new Date().toLocaleTimeString("ar-EG", { hour12: false });
      logs.push(`[${stamp}] ${msg}`);
      console.log(`[SIMULATION] ${msg}`);
    };

    try {
      log("بدء محاكاة تسجيل زائر لطلب جديد...");
      
      const settings = loadData(SETTINGS_FILE);
      const activeTemplateId = settings?.activeFormTemplateId;
      const template = settings?.formTemplates?.find((t: any) => t.id === activeTemplateId);
      
      const names = ["أحمد كريم يوسف الجارحي", "محمد علي محمود الشافعي", "خالد وليد فاروق النجار", "عبد الرحمن طارق صفوت الجمل", "يوسف رأفت الجمل سليم", "زياد حازم الشريف الشافي"];
      const provinces = ["القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "الغربية", "المنوفية"];
      const motherNames = ["منى عبد المنعم سليم", "نادية حسن الشافعي", "مريم كمال النجار", "وفاء سمير الديب"];
      const fatherJobs = ["مهندس برمجيات", "محاسب مالي", "مدرس لغة عربية", "طبيب عام", "تاجر تجزئة"];
      
      const randomSelect = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
      
      const tempId = Math.floor(100000 + Math.random() * 900000);
      const regNum = `SIM-${tempId}`;
      const fullName = randomSelect(names);
      
      log(`توليد بيانات الطالب التجريبية: ${fullName}`);
      log(`رقم التسجيل المولد للمحاكاة: ${regNum}`);

      const mockStudent: any = {
        id: crypto.randomUUID(),
        registrationNumber: regNum,
        fullName,
        province: randomSelect(provinces),
        dob: "2010-05-15",
        nationalId: `3100515${Math.floor(1000000 + Math.random() * 9000000)}`,
        score: Math.floor(250 + Math.random() * 30),
        fatherName: `${fullName.split(" ").slice(1).join(" ")}`,
        fatherJob: randomSelect(fatherJobs),
        motherName: randomSelect(motherNames),
        motherJob: "ربة منزل",
        phone: `01${Math.floor(100000000 + Math.random() * 900000000)}`,
        status: "PENDING",
        submissionDate: new Date().toISOString(),
        cloudSynced: false,
        documents: {},
        customData: {}
      };

      log("تأمين مسار الرفع المباشر والمجلد الخاص بالطالب في السيرفر...");
      const studentUploadDir = path.join(UPLOADS_DIR, String(regNum));
      if (!fs.existsSync(studentUploadDir)) {
        fs.mkdirSync(studentUploadDir, { recursive: true });
        log("تم إنشاء مجلد الطالب بنجاح على مسار الخادم المحلي.");
      }

      const mockPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const systemDocsKeys = ["personalPhoto", "birthCertificate", "prepCertificate", "parentNationalId"];
      
      log("محاكاة رفع المرفقات الأساسية وتحويلها إلى ملفات فيزيائية على الهارد ديسك...");
      for (const key of systemDocsKeys) {
        const buffer = Buffer.from(mockPngBase64.replace(/^data:image\/png;base64,/, ""), "base64");
        const filePath = path.join(studentUploadDir, `${key}.png`);
        fs.writeFileSync(filePath, buffer);
        
        const host = getRequestHost(req);
        mockStudent.documents[key] = `${host}/api/student-files/${regNum}/${key}`;
        log(`حفظ المستند [${key}] برابط محلي: ${mockStudent.documents[key]}`);
      }

      const activeFields = template?.formFields || settings?.formFields || [];
      for (const f of activeFields) {
        if (systemDocsKeys.includes(f.id)) continue;
        if (f.type === "file" || f.type === "image") {
          const buffer = Buffer.from(mockPngBase64.replace(/^data:image\/png;base64,/, ""), "base64");
          const filePath = path.join(studentUploadDir, `${f.id}.png`);
          fs.writeFileSync(filePath, buffer);
          
          const host = getRequestHost(req);
          mockStudent.customData[f.id] = {
            name: "simulated_upload.png",
            type: "image/png",
            size: 1024,
            dataUrl: `${host}/api/student-files/${regNum}/${f.id}`
          };
          log(`حفظ المستند الإضافي المخصص [${f.label}] برابط محلي: ${mockStudent.customData[f.id].dataUrl}`);
        } else {
          mockStudent.customData[f.id] = f.type === "number" ? Math.floor(10 + Math.random() * 90) : `قيمة تجريبية (${f.label})`;
        }
      }

      log("حفظ الطلب الجديد بقاعدة البيانات الحالية للتحضير لمزامنته...");
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      allSubmissions.push(mockStudent);
      saveData(SUBMISSIONS_FILE, allSubmissions);
      log(`تم تسجيل الطلب وحفظه بقاعدة البيانات برقم فريد.`);

      const spreadsheetId = template?.spreadsheetId || settings?.spreadsheetId;
      const fileFolderId = template?.filesFolderId || settings?.googleDriveFolderId;
      
      if (!spreadsheetId) {
        log("❌ خطأ: لم يتم تهيئة معرف ورقة جوجل شيتس (Spreadsheet ID مفقود في الإعدادات العامة)!");
        throw new Error("Missing spreadsheetId");
      }

      log("بدء مرحلة الاتصال بجوجل درايف وجوجل شيتس للمزامنة...");
      let auth: any;
      const { google } = await import("googleapis");
      const { Readable } = await import("stream");

      const localCached = loadCachedGoogleToken();
      const { googleToken } = req.body || {};
      const tokenToUse = googleToken || (localCached && (Date.now() - localCached.savedAt < 50 * 60 * 1000) ? localCached.token : null);

      if (tokenToUse) {
        log("مستند الدليل: استخدام رمز وصول المسؤول النشط والمصرح له من المتصفح...");
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: tokenToUse });
        auth = oauth2Client;
      } else {
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
          log("❌ خطأ: مفاتيح السيرفر (GOOGLE_APPLICATION_CREDENTIALS_JSON) وتوكن التخويل لجلسة المشرف كلاهما مفقودان!");
          throw new Error("تتطلب المحاكاة إما جلسة جوجل نشطة للادمن أو ملف حساب الخدمة الخلفي.");
        }
        log("استخدام بروتوكول الخدمة الخلفي ومجموعة مفاتيح Google Application Credentials...");
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
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

      log("الاتصال السحابي بورقة جوجل شيت ومعاينة التبويبات...");
      let sheetTitle = "Sheet1";
      try {
        const spreadSheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        sheetTitle = spreadSheetMeta.data.sheets?.[0]?.properties?.title || "Sheet1";
        log(`تم توصيل السيرفر بنجاح بملف الشيتس! اسم تبويب الإدخال النشط: [${sheetTitle}]`);
      } catch (metaErr: any) {
        log(`❌ فشل الاتصال برابط الشيتس: ${metaErr.message}`);
        throw metaErr;
      }

      let studentFolderId = fileFolderId;
      if (fileFolderId) {
        log("فحص المسار الرئيسي لإنشاء التسلسل الشجري المخصص للطالب بجوجل درايف...");
        const formName = template?.name || settings?.schoolName || "الاستمارة";
        const folderName = `${mockStudent.registrationNumber}_${mockStudent.fullName}`;
        
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
            log(`تم مطابقة مجلد الاستمارة بجوجل درايف: ID [${formFolderId}]`);
          } else {
            log(`مجلد الاستمارة مفقود، جاري إنشاء مجلد جديد باسم: [${formName}]`);
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
            log(`مخرجات جوجل درايف: تم إنشاء مجلد الاستمارة بوضع المعرف: ID [${formFolderId}]`);
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
            log(`تم اكتشاف مجلد الطالب مسبقاً بجوجل درايف: ID [${studentFolderId}]`);
          } else {
            log(`جاري إنشاء مجلد خاص بالطالب باسم: [${folderName}]...`);
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
            log(`مخرجات جوجل درايف: تم إنشاء مجلد الطالب بنجاح: ID [${studentFolderId}]`);
          }
        } catch (folderErr: any) {
          log(`⚠️ تنبيه: فشل تخليق مجلدات الطالب بسبب صلاحيات المجلد الأب. سيتم الرفع للمجلد العام: ${folderErr.message}`);
        }
      } else {
        log("⚠️ لا يوجد معرف مجلد درايف رئيسي في الإعدادات، سيتم تخطي تهيئة مجلدات الطلاب المرفقة.");
      }

      const uploadMockFileToDrive = async (fileName: string, key: string, label: string) => {
        try {
          log(`معالجة وتحضير مستند [${label}] للرفع الفوري...`);
          const filePath = path.join(studentUploadDir, `${key}.png`);
          if (!fs.existsSync(filePath)) {
            log(`❌ خطأ: تعذر العثور على الملف المحلي المولد لـ [${label}]`);
            return "";
          }

          const fileMetadata = {
            name: fileName,
            parents: studentFolderId ? [studentFolderId] : []
          };
          const buffer = fs.readFileSync(filePath);
          const media = {
            mimeType: "image/png",
            body: Readable.from(buffer)
          };
          
          log(`جاري استدعاء Google Drive API لرفع ملف [${fileName}]...`);
          const gResponse = await drive.files.create({
            requestBody: fileMetadata,
            media,
            fields: 'id, webViewLink',
            supportsAllDrives: true
          });
          const link = gResponse.data.webViewLink || `https://drive.google.com/open?id=${gResponse.data.id}`;
          log(`✅ تم الرفع بنجاح! الرابط السحابي: ${link}`);
          return link;
        } catch (err: any) {
          log(`❌ فشل رفع المستند [${label}] إلى درايف: ${err.message}`);
          return "";
        }
      };

      const systemDocsOutputs: any = {};
      for (const doc of [
        { key: 'personalPhoto', name: 'photo', label: 'الصورة الشخصية' },
        { key: 'birthCertificate', name: 'birth', label: 'شهادة الميلاد' },
        { key: 'prepCertificate', name: 'prep', label: 'شهادة الإعدادية' },
        { key: 'parentNationalId', name: 'parent_id', label: 'بطاقة ولي الأمر' }
      ]) {
        const fileTitle = `${doc.name}_${regNum}.png`;
        const driveUrl = await uploadMockFileToDrive(fileTitle, doc.key, doc.label);
        if (driveUrl) {
          systemDocsOutputs[doc.key] = driveUrl;
        }
      }

      const customDocsOutputs: any = {};
      for (const f of activeFields) {
        if (systemDocsKeys.includes(f.id)) continue;
        if (f.type === "file" || f.type === "image") {
          const fileTitle = `${f.id}_${regNum}_simulated.png`;
          const driveUrl = await uploadMockFileToDrive(fileTitle, f.id, f.label);
          if (driveUrl) {
            customDocsOutputs[f.id] = driveUrl;
          }
        } else {
          customDocsOutputs[f.id] = mockStudent.customData[f.id];
        }
      }

      const finalDocLinks = { ...mockStudent.documents, ...systemDocsOutputs };
      const finalCustomLinks = { ...mockStudent.customData };
      for (const key of Object.keys(customDocsOutputs)) {
        if (finalCustomLinks[key] && typeof finalCustomLinks[key] === "object") {
          finalCustomLinks[key] = {
            ...finalCustomLinks[key],
            dataUrl: customDocsOutputs[key]
          };
        } else {
          finalCustomLinks[key] = customDocsOutputs[key];
        }
      }

      const reSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const updatedIdx = reSubmissions.findIndex((s: any) => s.registrationNumber === regNum);
      if (updatedIdx > -1) {
        reSubmissions[updatedIdx].documents = finalDocLinks;
        reSubmissions[updatedIdx].customData = finalCustomLinks;
        reSubmissions[updatedIdx].cloudSynced = true;
        saveData(SUBMISSIONS_FILE, reSubmissions);
        log("تحديث ناجح لقاعدة البيانات بروابط جوجل درايف السحابية.");
      }

      log("استخلاص حقول ومطابقة أعمدة ورقة Google Sheets...");
      let headers: string[] = [];
      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A1:Z1`
        });
        headers = headerResponse.data.values?.[0] || [];
        log(`مصفوفة حقول الشيتس الملتقطة: [${headers.join(", ")}]`);
      } catch (err: any) {
        log(`⚠️ تنبيه: تعذر تتبع الأعمدة للتطابق التلقائي، سيتم استخدام الترتيب الافتراضي: ${err.message}`);
      }

      const statusArabic = "قيد المراجعة";
      const normalize = (s: string) => s ? s.replace(/\s+/g, "").toLowerCase() : "";
      
      const headerMap: { [key: string]: string } = {
        "id": mockStudent.id,
        "registrationnumber": mockStudent.registrationNumber,
        "كودالطلب": mockStudent.registrationNumber,
        "الرقمالتسجيلى": mockStudent.registrationNumber,
        "الاسمرباعي": mockStudent.fullName,
        "الاسم": mockStudent.fullName,
        "اسمطالب": mockStudent.fullName,
        "المحافظة": mockStudent.province,
        "تاريخالميلاد": mockStudent.dob,
        "الرقمالقومي": mockStudent.nationalId,
        "المجموع": String(mockStudent.score),
        "مجموعدرجات": String(mockStudent.score),
        "حالةالطلب": statusArabic,
        "حالة": statusArabic,
        "الحالة": statusArabic,
        "اسموليالأمر": mockStudent.fatherName,
        "رقمالموبايل": mockStudent.phone,
        "المستندات": Object.values(finalDocLinks).join("\n"),
        "الصورةالشخصية": finalDocLinks.personalPhoto || "",
        "شهادةالميلاد": finalDocLinks.birthCertificate || "",
        "تاريخالتقديم": mockStudent.submissionDate
      };

      let rowValues: string[] = [];
      if (headers.length > 0) {
        rowValues = headers.map(h => {
          const normHeader = normalize(h);
          if (headerMap[normHeader] !== undefined) {
            return headerMap[normHeader];
          }
          const matchedField = activeFields.find((f: any) => normalize(f.label) === normHeader);
          if (matchedField) {
            const customVal = finalCustomLinks[matchedField.id];
            if (customVal && typeof customVal === "object") {
              return customVal.dataUrl || customVal.url || "";
            }
            return customVal ? String(customVal) : "";
          }
          return "";
        });
        log("تم صياغة الخلايا وملاءمة كافة روابط الملفات مع ترويسة ورقة العمل.");
      } else {
        rowValues = [
          mockStudent.registrationNumber,
          mockStudent.fullName,
          mockStudent.nationalId,
          mockStudent.phone,
          mockStudent.province,
          String(mockStudent.score),
          statusArabic,
          mockStudent.submissionDate,
          finalDocLinks.personalPhoto || "",
          finalDocLinks.birthCertificate || ""
        ];
        log("تم صياغة الصف التجريبي بالهيكل القياسي الافتراضي.");
      }

      log("كتابة وإرسال الصف الجديد إلى Google Sheets...");
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetTitle}!A:A`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowValues]
        }
      });
      log("🎉 تمت كتابة الصف وإثبات التسجيل بنجاح في ورقة Google Sheets!");

      log("المحاكاة واختبار الأمان والربط سليم وبدون أخطاء!");
      res.json({
        success: true,
        regNum,
        fullName,
        logs,
        driveFolderUrl: studentFolderId ? `https://drive.google.com/drive/folders/${studentFolderId}` : `https://drive.google.com/drive/folders/${fileFolderId}`,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        uploadedFiles: finalDocLinks
      });

    } catch (err: any) {
      log(`❌ خطأ فادح أثناء المحاكاة: ${err.message || err}`);
      res.json({
        success: false,
        logs,
        error: err.message || "Simulation Failed"
      });
    }
  });

  app.post("/api/settings", (req, res) => {
    saveData(SETTINGS_FILE, req.body);
    res.json({ success: true });
  });

  app.get("/api/users", (req, res) => {
    res.json(loadData(USERS_FILE) || []);
  });

  app.post("/api/users", (req, res) => {
    const user = req.body;
    const all = loadData(USERS_FILE) || [];
    const index = all.findIndex((u: any) => u.uid === user.uid || u.email === user.email);
    if (index > -1) all[index] = { ...all[index], ...user };
    else all.push(user);
    saveData(USERS_FILE, all);
    res.json({ success: true });
  });

  app.post("/api/generate-exam", async (req, res) => {
    try {
      const { prompt, fileData, mimeType, structure } = req.body;

      const contents: any[] = [];
      
      if (fileData && mimeType) {
        contents.push({
          inlineData: {
            data: fileData,
            mimeType: mimeType
          }
        });
      }

      let structurePrompt = "";
      if (structure && Array.isArray(structure)) {
        structurePrompt = `The exam MUST exactly contain the following numbers and types of questions:
        ${structure.map((b: any) => `- ${b.itemCount} questions of type ${b.type}`).join("\n")}
        Ensure the question types match exactly [TRUE_FALSE, MULTIPLE_CHOICE, MATCHING, ESSAY].`;
      } else {
        structurePrompt = "Create a mix of TRUE_FALSE, MULTIPLE_CHOICE, MATCHING, and ESSAY questions.";
      }

      contents.push({
        text: `Generate a comprehensive exam based on the following input: ${prompt}.
        ${structurePrompt}
        The response must be in JSON format matching the specified schema.
        Questions should be in Arabic, appropriate for a curriculum context.
        For MULTIPLE_CHOICE, provide 4 options.
        For MATCHING, provide a list of pairs.
        For auto-gradable questions (TRUE_FALSE, MULTIPLE_CHOICE), provide the correct answer.`
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: contents },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { 
                      type: Type.STRING, 
                      enum: ["TRUE_FALSE", "MULTIPLE_CHOICE", "MATCHING", "ESSAY"] 
                    },
                    text: { type: Type.STRING },
                    options: { 
                      type: Type.ARRAY, 
                      items: { type: Type.STRING } 
                    },
                    matchingPairs: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          left: { type: Type.STRING },
                          right: { type: Type.STRING }
                        }
                      }
                    },
                    correctAnswer: { type: Type.STRING },
                    points: { type: Type.NUMBER }
                  },
                  required: ["type", "text", "points"]
                }
              }
            },
            required: ["title", "questions"]
          }
        }
      });

      const examData = JSON.parse(response.text);
      res.json(examData);
    } catch (error: any) {
      console.error("Gemini Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate exam" });
    }
  });

  // Robust environment detection
  const isProdEnv = process.env.NODE_ENV === "production";
  const distPath = path.resolve(process.cwd(), "dist");
  const indexExists = fs.existsSync(path.join(distPath, "index.html"));

  // We only serve static if we are explicitly in production OR if we are in a state where Vite shouldn't be used
  const useStatic = isProdEnv || (indexExists && process.env.VITE_DEV !== "true");

  console.log("[Server] Diagnosis:", {
    NODE_ENV: process.env.NODE_ENV,
    isProdEnv,
    useStatic,
    distPath,
    indexExists,
  });

  if (useStatic) {
    console.log("[Server] Static Mode: Serving from", distPath);
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API Route Not Found" });
      }

      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send("Application files missing.");
      }
    });
  } else {
    console.log("[Server] Middleware Mode: Loading Vite...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("[Server] Critical: Failed to load Vite middleware", e);
      // In dev mode failure, we don't have a 'res' object here as we're initializing the app
    }
  }

  try {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Server] Success! Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("[Server] Critical failure during listen:", err);
  }
}

startServer().catch((err) => {
  console.error("FAILED TO START SERVER:", err);
  process.exit(1);
});
