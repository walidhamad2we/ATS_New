var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_genai = require("@google/genai");
var ai = new import_genai.GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  console.log(`[Server] Starting on port ${PORT}...`);
  app.get("/health", (req, res) => res.json({ status: "up", node: process.version }));
  app.get("/ping", (req, res) => res.send("pong"));
  app.use(import_express.default.json({ limit: "50mb" }));
  let lastObservedHost = "https://ais-dev-bb5wgbpc7miiuzfokbkkk7-426220485262.europe-west2.run.app";
  const getRequestHost = (req) => {
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
        } catch (e) {
        }
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
  app.use((req, res, next) => {
    getRequestHost(req);
    next();
  });
  const DATA_DIR = import_path.default.join(process.cwd(), "data");
  if (!import_fs.default.existsSync(DATA_DIR)) {
    import_fs.default.mkdirSync(DATA_DIR);
  }
  const UPLOADS_DIR = import_path.default.join(DATA_DIR, "uploads");
  if (!import_fs.default.existsSync(UPLOADS_DIR)) {
    import_fs.default.mkdirSync(UPLOADS_DIR);
  }
  const GOOGLE_TOKEN_FILE = import_path.default.join(DATA_DIR, "google_token.json");
  const saveCachedGoogleToken = (token) => {
    try {
      import_fs.default.writeFileSync(GOOGLE_TOKEN_FILE, JSON.stringify({ token, savedAt: Date.now() }, null, 2));
    } catch (e) {
      console.error("Failed to write google token to disk:", e);
    }
  };
  const loadCachedGoogleToken = () => {
    try {
      if (import_fs.default.existsSync(GOOGLE_TOKEN_FILE)) {
        return JSON.parse(import_fs.default.readFileSync(GOOGLE_TOKEN_FILE, "utf-8"));
      }
    } catch (e) {
    }
    return null;
  };
  const SUBMISSIONS_FILE = import_path.default.join(DATA_DIR, "submissions.json");
  const SETTINGS_FILE = import_path.default.join(DATA_DIR, "settings.json");
  const USERS_FILE = import_path.default.join(DATA_DIR, "users.json");
  const loadData = (file) => {
    if (import_fs.default.existsSync(file)) {
      try {
        return JSON.parse(import_fs.default.readFileSync(file, "utf-8"));
      } catch (e) {
        return null;
      }
    }
    return null;
  };
  const saveData = (file, data) => {
    import_fs.default.writeFileSync(file, JSON.stringify(data, null, 2));
  };
  const SYNC_LOGS_FILE = import_path.default.join(DATA_DIR, "sync_logs.json");
  const logSyncStatus = (studentName, regNum, status, error, details) => {
    try {
      let logs = [];
      if (import_fs.default.existsSync(SYNC_LOGS_FILE)) {
        try {
          logs = JSON.parse(import_fs.default.readFileSync(SYNC_LOGS_FILE, "utf-8")) || [];
        } catch (e) {
        }
      }
      logs.unshift({
        id: Math.random().toString(36).substring(2, 11),
        timestamp: (/* @__PURE__ */ new Date()).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }),
        studentName,
        regNum,
        status,
        error: error || null,
        details: details || null
      });
      if (logs.length > 50) {
        logs = logs.slice(0, 50);
      }
      import_fs.default.writeFileSync(SYNC_LOGS_FILE, JSON.stringify(logs, null, 2));
    } catch (e) {
      console.error("Failed to write sync log:", e);
    }
  };
  const syncToSheets = async (submission, accessToken, req) => {
    let clientEmail = "";
    try {
      const { google } = await import("googleapis");
      const { Readable } = await import("stream");
      const settings = loadData(SETTINGS_FILE);
      const activeTemplateId = settings?.activeFormTemplateId;
      const template = settings?.formTemplates?.find((t) => t.id === activeTemplateId);
      const spreadsheetId = template?.spreadsheetId || settings?.spreadsheetId;
      const fileFolderId = template?.filesFolderId || settings?.googleDriveFolderId;
      if (!spreadsheetId) {
        console.warn("[Google Sheets Sync] No spreadsheet ID configured in settings.");
        return;
      }
      let auth;
      const localCached = loadCachedGoogleToken();
      if (accessToken) {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        auth = oauth2Client;
      } else if (localCached && Date.now() - localCached.savedAt < 50 * 60 * 1e3) {
        console.log("[Google Sheets/Drive Sync] Authenticating using stored Admin Google token...");
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: localCached.token });
        auth = oauth2Client;
      } else {
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
          console.warn("[Google Drive / Sheets Sync] GOOGLE_APPLICATION_CREDENTIALS_JSON and valid cached Google token are both missing.");
          logSyncStatus(
            submission.fullName || "\u062D\u0633\u0627\u0628 \u062A\u062C\u0631\u064A\u0628\u064A/\u0632\u0627\u0626\u0631",
            submission.registrationNumber || "\u0628\u062F\u0648\u0646 \u0631\u0642\u0645",
            "failed",
            "\u0639\u0637\u0644 \u0641\u064A \u062E\u064A\u0627\u0631\u0627\u062A \u0628\u064A\u0626\u0629 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 (\u0645\u0641\u062A\u0627\u062D \u062C\u0648\u062C\u0644 \u0627\u0644\u062E\u0644\u0641\u064A \u063A\u064A\u0631 \u0645\u0647\u064A\u0623)",
            "\u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u062D\u0633\u0627\u0628 \u062C\u0648\u062C\u0644 \u0644\u062A\u0646\u0634\u064A\u0637 \u062C\u0644\u0633\u0629 \u0627\u0644\u0645\u0624\u0642\u062A\u0629 \u0644\u0644\u0645\u0634\u0631\u0641\u060C \u0623\u0648 \u0642\u0645 \u0628\u062A\u0647\u064A\u0626\u0629 \u0645\u0644\u0641 \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F GOOGLE_APPLICATION_CREDENTIALS_JSON \u0641\u064A \u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629 \u0644\u062A\u0645\u0643\u064A\u0646 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A\u0629 24/7."
          );
          return;
        }
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        clientEmail = credentials.client_email || "";
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
          ]
        });
      }
      const sheets = google.sheets({ version: "v4", auth });
      const drive = google.drive({ version: "v3", auth });
      let sheetTitle = "Sheet1";
      try {
        const spreadSheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        sheetTitle = spreadSheetMeta.data.sheets?.[0]?.properties?.title || "Sheet1";
      } catch (metaErr) {
        if (metaErr.message?.includes("permission") || metaErr.status === 403) {
          throw metaErr;
        }
        console.warn("Failed to fetch spreadsheet meta, defaulting to Sheet1:", metaErr.message || metaErr);
      }
      let studentFolderId = fileFolderId;
      if (fileFolderId) {
        const formName = template?.name || settings?.schoolName || "\u0627\u0644\u0627\u0633\u062A\u0645\u0627\u0631\u0629";
        const folderName = `${submission.registrationNumber}_${submission.fullName}`;
        try {
          let formFolderId = fileFolderId;
          const qForm = `name = '${formName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${fileFolderId}' in parents and trashed = false`;
          const existingForm = await drive.files.list({
            q: qForm,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
          if (existingForm.data.files && existingForm.data.files.length > 0) {
            formFolderId = existingForm.data.files[0].id;
          } else {
            const formFolderMeta = {
              name: formName,
              mimeType: "application/vnd.google-apps.folder",
              parents: [fileFolderId]
            };
            const fFormCreated = await drive.files.create({
              requestBody: formFolderMeta,
              fields: "id",
              supportsAllDrives: true
            });
            formFolderId = fFormCreated.data.id;
          }
          const qStudent = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${formFolderId}' in parents and trashed = false`;
          const existingStudent = await drive.files.list({
            q: qStudent,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
          if (existingStudent.data.files && existingStudent.data.files.length > 0) {
            studentFolderId = existingStudent.data.files[0].id;
          } else {
            const studentFolderMeta = {
              name: folderName,
              mimeType: "application/vnd.google-apps.folder",
              parents: [formFolderId]
            };
            const fStudentCreated = await drive.files.create({
              requestBody: studentFolderMeta,
              fields: "id",
              supportsAllDrives: true
            });
            studentFolderId = fStudentCreated.data.id;
          }
        } catch (folderErr) {
          console.error("Failed to manage Google Drive nested folders:", folderErr.message || folderErr);
        }
      }
      const uploadBase64File = async (fileName, dataUrl, docKey) => {
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
          let buffer;
          const studentUploadDir = import_path.default.join(UPLOADS_DIR, String(submission.registrationNumber));
          let fileFoundOnDisk = false;
          if (import_fs.default.existsSync(studentUploadDir)) {
            const files = import_fs.default.readdirSync(studentUploadDir);
            const matchedFile = files.find((f) => import_path.default.parse(f).name === docKey);
            if (matchedFile) {
              const filePath = import_path.default.join(studentUploadDir, matchedFile);
              const ext = import_path.default.extname(matchedFile).toLowerCase();
              mimeType = ext === ".pdf" ? "application/pdf" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
              buffer = import_fs.default.readFileSync(filePath);
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
            buffer = Buffer.from(matches[2], "base64");
          }
          const fileMetadata = {
            name: fileName,
            parents: studentFolderId ? [studentFolderId] : []
          };
          const media = {
            mimeType,
            body: Readable.from(buffer)
          };
          const gResponse = await drive.files.create({
            requestBody: fileMetadata,
            media,
            fields: "id, webViewLink",
            supportsAllDrives: true
          });
          return gResponse.data.webViewLink || `https://drive.google.com/open?id=${gResponse.data.id}`;
        } catch (uploadErrPre) {
          const errMsg = uploadErrPre.message || String(uploadErrPre);
          console.error(`Failed to upload file ${fileName} for ${submission.registrationNumber}:`, errMsg);
          const fallbackUrl = getFallbackUrl();
          console.log(`Fallback URL activated due to upload error: ${fallbackUrl}`);
          return fallbackUrl;
        }
      };
      const updatedDocuments = { ...submission.documents || {} };
      const systemDocs = [
        { key: "personalPhoto", name: "photo" },
        { key: "birthCertificate", name: "birth" },
        { key: "prepCertificate", name: "prep" },
        { key: "parentNationalId", name: "parent_id" }
      ];
      for (const doc of systemDocs) {
        const dataUrl = submission.documents?.[doc.key];
        if (dataUrl && (dataUrl.startsWith("data:") || dataUrl.includes("/api/student-files/"))) {
          let suffix = "png";
          const studentUploadDir = import_path.default.join(UPLOADS_DIR, String(submission.registrationNumber));
          if (import_fs.default.existsSync(studentUploadDir)) {
            const files = import_fs.default.readdirSync(studentUploadDir);
            const matchedFile = files.find((f) => import_path.default.parse(f).name === doc.key);
            if (matchedFile) {
              const ext = import_path.default.extname(matchedFile).toLowerCase();
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
      const customDataWithLinks = { ...submission.customData || {} };
      const activeFields = template?.formFields || settings?.formFields || [];
      for (const f of activeFields) {
        if (systemDocs.some((sd) => sd.key === f.id)) continue;
        const fieldVal = submission.customData?.[f.id];
        if (fieldVal && typeof fieldVal === "object") {
          const dataUrl = fieldVal.dataUrl;
          if (dataUrl && (dataUrl.startsWith("data:") || dataUrl.includes("/api/student-files/"))) {
            let suffix = "png";
            const studentUploadDir = import_path.default.join(UPLOADS_DIR, String(submission.registrationNumber));
            if (import_fs.default.existsSync(studentUploadDir)) {
              const files = import_fs.default.readdirSync(studentUploadDir);
              const matchedFile = files.find((file) => import_path.default.parse(file).name === f.id);
              if (matchedFile) {
                const ext = import_path.default.extname(matchedFile).toLowerCase();
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
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const idx = allSubmissions.findIndex((s) => s.id === submission.id);
      if (idx > -1) {
        allSubmissions[idx].documents = updatedDocuments;
        allSubmissions[idx].customData = customDataWithLinks;
        allSubmissions[idx].cloudSynced = true;
        saveData(SUBMISSIONS_FILE, allSubmissions);
        console.log(`[Server] Succeeded in transferring local base64 files to Cloud links for student ${submission.fullName}`);
      }
      let headers = [];
      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A1:Z1`
        });
        headers = headerResponse.data.values?.[0] || [];
      } catch (err) {
        console.warn("Could not fetch Google Sheet headers dynamically, falling back to static schema mapping:", err.message || err);
      }
      const statusArabic = submission.status === "ACCEPTED" ? "\u0645\u0642\u0628\u0648\u0644" : submission.status === "REJECTED" ? "\u0645\u0631\u0641\u0648\u0636 \u0646\u0647\u0627\u0626\u064A\u0627\u064B" : submission.status === "REVISION_REQUESTED" ? "\u0645\u0637\u0644\u0648\u0628 \u062A\u0639\u062F\u064A\u0644" : submission.status === "INCOMPLETE" ? "\u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0627\u0642\u0635\u0629" : "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629";
      const normalizeArabic = (str) => {
        if (!str) return "";
        return str.toLowerCase().trim().replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/\s+/g, "").replace(/[^\w\u0600-\u06FF]/g, "");
      };
      let rowValues = [];
      if (headers.length > 0) {
        for (const header of headers) {
          const cleanHeader = String(header || "").trim();
          if (!cleanHeader) {
            rowValues.push("");
            continue;
          }
          const norm = normalizeArabic(cleanHeader);
          const isParentIdImg = (norm.includes("\u0635\u0648\u0631\u0647") || norm.includes("\u0628\u0637\u0627\u0642\u0647") || norm.includes("\u0647\u0648\u064A\u0647") || norm.includes("\u0645\u0644\u0641") || norm.includes("\u0645\u0631\u0641\u0642") || norm.includes("\u0631\u0627\u0628\u0637") || norm.includes("\u062A\u062D\u0645\u064A\u0644")) && (norm.includes("\u0627\u0644\u0642\u0648\u0645\u064A") || norm.includes("\u0642\u0648\u0645\u064A") || norm.includes("\u0628\u0637\u0627\u0642\u0647") || norm.includes("\u0647\u0648\u064A\u0647")) && (norm.includes("\u0648\u0644\u064A") || norm.includes("\u0627\u0644\u0627\u0645\u0631"));
          const isPersonalPhotoImg = (norm.includes("\u0634\u062E\u0635\u064A\u0647") || norm.includes("\u0637\u0627\u0644\u0628") || norm.includes("\u0635\u0648\u0631\u0647") && norm.includes("\u0637\u0627\u0644\u0628")) && !norm.includes("\u0648\u0644\u064A") && !norm.includes("\u0627\u0644\u0627\u0645\u0631") && !norm.includes("\u0645\u064A\u0644\u0627\u062F") && !norm.includes("\u0627\u0639\u062F\u0627\u062F") && !norm.includes("\u0627\u062A\u0645\u0627\u0645");
          const isPrepCertificateImg = norm.includes("\u0627\u0639\u062F\u0627\u062F") || norm.includes("\u0627\u062A\u0645\u0627\u0645") || norm.includes("\u0634\u0647\u0627\u062F\u0647\u0627\u062A\u0645\u0627\u0645");
          const isBirthCertificateImg = norm.includes("\u0645\u064A\u0644\u0627\u062F");
          if (isParentIdImg) {
            rowValues.push(updatedDocuments.parentNationalId || "");
          } else if (isPersonalPhotoImg) {
            rowValues.push(updatedDocuments.personalPhoto || "");
          } else if (isPrepCertificateImg) {
            rowValues.push(updatedDocuments.prepCertificate || "");
          } else if (isBirthCertificateImg) {
            rowValues.push(updatedDocuments.birthCertificate || "");
          } else if (norm.includes("\u062A\u0633\u062C\u064A\u0644") && !norm.includes("\u062A\u0627\u0631\u064A\u062E") && !norm.includes("\u0648\u0642\u062A")) {
            rowValues.push(submission.registrationNumber || "");
          } else if (norm.includes("\u0627\u0644\u0627\u0633\u0645\u0631\u0628\u0627\u0639\u064A") || norm.includes("\u0627\u0644\u0627\u0633\u0645\u0643\u0627\u0645\u0644") || norm === "\u0627\u0644\u0627\u0633\u0645" || norm === "\u0627\u0633\u0645" || norm.includes("\u0627\u0633\u0645") && norm.includes("\u0637\u0627\u0644\u0628") || norm.includes("\u0627\u0644\u0627\u0633\u0645") && !norm.includes("\u0648\u0644\u064A") && !norm.includes("\u0627\u0644\u0627\u0645\u0631") && !norm.includes("\u0627\u0644\u0627\u0645") && !norm.includes("\u0627\u0628") && !norm.includes("\u0635\u0648\u0631\u0647") && !norm.includes("\u0634\u0647\u0627\u062F\u0647") && !norm.includes("\u0645\u0644\u0641") && !norm.includes("\u0645\u0631\u0641\u0642") && !norm.includes("\u0631\u0627\u0628\u0637")) {
            rowValues.push(submission.fullName || "");
          } else if (norm.includes("\u0645\u062D\u0627\u0641\u0638\u0647")) {
            rowValues.push(submission.province || "");
          } else if (norm.includes("\u062A\u0627\u0631\u064A\u062E\u0627\u0644\u0645\u064A\u0644\u0627\u062F") || norm.includes("\u062A\u0627\u0631\u064A\u062E\u0645\u064A\u0644\u0627\u062F") || norm.includes("\u062A\u0627\u0631\u064A\u062E\u0627\u0644\u0648\u0644\u0627\u062F\u0647") || norm.includes("\u062A\u0627\u0631\u064A\u062E") && norm.includes("\u0645\u064A\u0644\u0627\u062F")) {
            rowValues.push(submission.dob || "");
          } else if ((norm.includes("\u0627\u0644\u0642\u0648\u0645\u064A") || norm.includes("\u0642\u0648\u0645\u064A")) && !norm.includes("\u0648\u0644\u064A") && !norm.includes("\u0627\u0644\u0627\u0645\u0631") && !norm.includes("\u0635\u0648\u0631\u0647") && !norm.includes("\u0628\u0637\u0627\u0642\u0647") && !norm.includes("\u0647\u0648\u064A\u0647") && !norm.includes("\u0645\u0644\u0641") && !norm.includes("\u0645\u0631\u0641\u0642") && !norm.includes("\u0631\u0627\u0628\u0637")) {
            rowValues.push(submission.nationalId || "");
          } else if (norm.includes("\u0645\u062C\u0645\u0648\u0639") || norm.includes("\u062F\u0631\u062C\u0647") || norm === "\u0627\u0644\u0645\u062C\u0645\u0648\u0639") {
            rowValues.push(submission.score || 0);
          } else if (norm.includes("\u0627\u0633\u0645") && (norm.includes("\u0648\u0644\u064A") || norm.includes("\u0627\u0644\u0627\u0645\u0631") || norm.includes("\u0627\u0628")) && !norm.includes("\u0648\u0638\u064A\u0641\u0647") && !norm.includes("\u0639\u0645\u0644") && !norm.includes("\u0645\u0647\u0646\u0647") && !norm.includes("\u0627\u0644\u0631\u0642\u0645") && !norm.includes("\u0627\u0644\u0642\u0648\u0645\u064A")) {
            rowValues.push(submission.fatherName || "");
          } else if ((norm.includes("\u0648\u0644\u064A") || norm.includes("\u0627\u0644\u0627\u0645\u0631") || norm.includes("\u0627\u0628")) && (norm.includes("\u0648\u0638\u064A\u0641\u0647") || norm.includes("\u0639\u0645\u0644") || norm.includes("\u0645\u0647\u0646\u0647"))) {
            rowValues.push(submission.fatherJob || "");
          } else if (norm.includes("\u0627\u0633\u0645") && (norm.includes("\u0627\u0644\u0627\u0645") || norm.includes("\u0627\u0645")) && !norm.includes("\u0639\u0645\u0644") && !norm.includes("\u0648\u0638\u064A\u0641\u0647") && !norm.includes("\u0645\u0647\u0646\u0647")) {
            rowValues.push(submission.motherName || "");
          } else if ((norm.includes("\u0627\u0644\u0627\u0645") || norm.includes("\u0627\u0645")) && (norm.includes("\u0648\u0638\u064A\u0641\u0647") || norm.includes("\u0639\u0645\u0644") || norm.includes("\u0645\u0647\u0646\u0647"))) {
            rowValues.push(submission.motherJob || "");
          } else if (norm.includes("\u0645\u0648\u0628\u0627\u064A\u0644") || norm.includes("\u0647\u0627\u062A\u0641") || norm.includes("\u062A\u0644\u064A\u0641\u0648\u0646") || norm.includes("\u0648\u0627\u062A\u0633") || norm.includes("\u0627\u062A\u0635\u0627\u0644")) {
            rowValues.push(submission.phone || "");
          } else if (norm.includes("\u062A\u0627\u0631\u064A\u062E\u0627\u0644\u062A\u0642\u062F\u064A\u0645") || norm.includes("\u062A\u0627\u0631\u064A\u062E\u062A\u0642\u062F\u064A\u0645") || norm.includes("\u062A\u0627\u0631\u064A\u062E\u0627\u0644\u062A\u0633\u062C\u064A\u0644") || norm.includes("\u062A\u0627\u0631\u064A\u062E") && (norm.includes("\u062A\u0642\u062F\u064A\u0645") || norm.includes("\u0627\u0631\u0633\u0627\u0644"))) {
            rowValues.push(submission.createdAt ? new Date(submission.createdAt).toLocaleString("ar-EG") : (/* @__PURE__ */ new Date()).toLocaleString("ar-EG"));
          } else if (norm.includes("\u062D\u0627\u0644\u0647") || norm.includes("\u0627\u0644\u062D\u0627\u0644\u0647")) {
            rowValues.push(statusArabic);
          } else {
            const matchedField = activeFields.find((f) => f.label === cleanHeader || f.id === cleanHeader);
            if (matchedField) {
              const val = customDataWithLinks[matchedField.id];
              if (val && typeof val === "object") {
                rowValues.push(val.url || val.name || JSON.stringify(val));
              } else {
                rowValues.push(val || "");
              }
            } else {
              const directVal = customDataWithLinks[cleanHeader] || submission[cleanHeader];
              rowValues.push(directVal ? typeof directVal === "object" ? JSON.stringify(directVal) : directVal : "");
            }
          }
        }
      } else {
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
          (/* @__PURE__ */ new Date()).toLocaleString("ar-EG"),
          statusArabic,
          updatedDocuments.birthCertificate || "",
          updatedDocuments.personalPhoto || "",
          updatedDocuments.prepCertificate || "",
          updatedDocuments.parentNationalId || ""
        ];
      }
      let rowIndex = -1;
      try {
        const checkResp = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A:A`
        });
        const rows = checkResp.data.values || [];
        rowIndex = rows.findIndex((r) => String(r[0] || "").trim() === String(submission.registrationNumber).trim());
      } catch (checkErr) {
        console.warn("Failed checking for duplicate registration row:", checkErr.message || checkErr);
      }
      if (rowIndex >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetTitle}!A${rowIndex + 1}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [rowValues] }
        });
        console.log(`[Google Sheets] Succeeded in UPDATING row ${rowIndex + 1} for pupil: ${submission.registrationNumber}`);
        logSyncStatus(submission.fullName, submission.registrationNumber, "success", void 0, `\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0633\u0637\u0631 ${rowIndex + 1} \u0628\u0646\u062C\u0627\u062D \u0641\u064A \u062C\u062F\u0648\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u062D\u0627\u0628\u064A.`);
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetTitle}!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [rowValues] }
        });
        console.log(`[Google Sheets] Succeeded in APPENDING new row for pupil: ${submission.registrationNumber}`);
        logSyncStatus(submission.fullName, submission.registrationNumber, "success", void 0, "\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0633\u062C\u0644 \u062C\u062F\u064A\u062F \u0628\u0646\u062C\u0627\u062D \u0641\u064A \u062C\u062F\u0648\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u062D\u0627\u0628\u064A.");
      }
    } catch (e) {
      let errStr = e.message || String(e);
      let details = "";
      if (e.message?.includes("permission") || e.status === 403) {
        errStr = "\u062A\u0645 \u0631\u0641\u0636 \u0625\u0630\u0646 \u0627\u0644\u0648\u0635\u0648\u0644 (Permission Denied / 403)";
        details = `\u064A\u0631\u062C\u0649 \u0641\u062A\u062D \u0645\u0644\u0641 Google Sheets \u0648\u0627\u0644\u0645\u062C\u0644\u062F \u0627\u0644\u062E\u0627\u0635 \u0628\u0643\u060C \u0648\u0627\u0644\u0636\u063A\u0637 \u0639\u0644\u0649 \u0645\u0634\u0627\u0631\u0643\u0629 (Share) \u0648\u0625\u0636\u0627\u0641\u0629 \u0628\u0631\u064A\u062F \u0627\u0644\u0631\u0648\u0628\u0648\u062A \u0627\u0644\u062A\u0627\u0644\u064A \u0643\u0640 Editor (\u0645\u062D\u0631\u0631) \u0644\u064A\u062A\u0645\u0643\u0646 \u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u0646 \u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B: [ ${clientEmail || "\u0628\u0631\u064A\u062F \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0633\u062D\u0627\u0628\u064A\u0629 \u0627\u0644\u062E\u0627\u0635 \u0628\u0643"} ]`;
        console.error(`[Google Sheets Sync Error] PERMISSION DENIED! The spreadsheet has not been shared with the app service account email. 
\u{1F449} Please open your Google Sheet, click 'Share' (\u0645\u0634\u0627\u0631\u0643\u0629), and add this email as Editor:
   ${clientEmail || "your-google-service-account-email"}
`);
      } else {
        console.error("Sheets Sync Error:", e.message || e);
        details = `\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062E\u0637\u0623: ${e.message || "\u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641 \u0641\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u062C\u0648\u062C\u0644 \u0634\u064A\u062A\u0633."}`;
      }
      logSyncStatus(submission.fullName || "\u0645\u062A\u0631\u0634\u062D \u0632\u0627\u0626\u0631", submission.registrationNumber || "\u0628\u062F\u0648\u0646 \u0631\u0642\u0645", "failed", errStr, details);
    }
  };
  app.get("/api/submissions", (req, res) => {
    res.json(loadData(SUBMISSIONS_FILE) || []);
  });
  app.get("/api/sync-logs", (req, res) => {
    try {
      if (import_fs.default.existsSync(SYNC_LOGS_FILE)) {
        return res.json(JSON.parse(import_fs.default.readFileSync(SYNC_LOGS_FILE, "utf-8")) || []);
      }
    } catch (e) {
    }
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
      const studentUploadDir = import_path.default.join(UPLOADS_DIR, String(regNum));
      if (import_fs.default.existsSync(studentUploadDir)) {
        const files = import_fs.default.readdirSync(studentUploadDir);
        const matchedFile = files.find((f) => import_path.default.parse(f).name === docKey);
        if (matchedFile) {
          const filePath = import_path.default.join(studentUploadDir, matchedFile);
          const ext = import_path.default.extname(matchedFile).toLowerCase();
          const mimeType = ext === ".pdf" ? "application/pdf" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Content-Disposition", `inline; filename="${matchedFile}"`);
          return res.sendFile(filePath);
        }
      }
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      const submission = allSubmissions.find((s) => s.registrationNumber === regNum);
      if (!submission) {
        return res.status(404).send("File not found");
      }
      let dataUrl = submission.documents?.[docKey];
      if (!dataUrl) {
        const fieldVal = submission.customData?.[docKey];
        if (fieldVal && typeof fieldVal === "object") {
          dataUrl = fieldVal.dataUrl || fieldVal.url;
        }
      }
      if (dataUrl && typeof dataUrl === "string") {
        if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
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
    } catch (err) {
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
      const studentUploadDir = import_path.default.join(UPLOADS_DIR, String(regNum));
      if (!import_fs.default.existsSync(studentUploadDir)) {
        import_fs.default.mkdirSync(studentUploadDir, { recursive: true });
      }
      const host = getRequestHost(req);
      if (submission.documents) {
        for (const key of Object.keys(submission.documents)) {
          const val = submission.documents[key];
          if (val && typeof val === "string" && val.startsWith("data:")) {
            const suffix = val.includes("application/pdf") ? "pdf" : val.includes("image/jpeg") ? "jpg" : "png";
            const matches = val.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const buffer = Buffer.from(matches[2], "base64");
              const filePath = import_path.default.join(studentUploadDir, `${key}.${suffix}`);
              import_fs.default.writeFileSync(filePath, buffer);
              submission.documents[key] = `${host}/api/student-files/${regNum}/${key}`;
            }
          }
        }
      }
      if (submission.customData) {
        for (const key of Object.keys(submission.customData)) {
          const val = submission.customData[key];
          if (val && typeof val === "object" && val.dataUrl && val.dataUrl.startsWith("data:")) {
            const suffix = val.type?.includes("pdf") ? "pdf" : val.type?.includes("jpeg") || val.type?.includes("jpg") ? "jpg" : "png";
            const matches = val.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              const buffer = Buffer.from(matches[2], "base64");
              const filePath = import_path.default.join(studentUploadDir, `${key}.${suffix}`);
              import_fs.default.writeFileSync(filePath, buffer);
              submission.customData[key] = {
                ...val,
                dataUrl: `${host}/api/student-files/${regNum}/${key}`
              };
            }
          }
        }
      }
      const all = loadData(SUBMISSIONS_FILE) || [];
      const index = all.findIndex((s) => s.id === submission.id);
      if (index > -1) all[index] = { ...all[index], ...submission };
      else all.push(submission);
      saveData(SUBMISSIONS_FILE, all);
      syncToSheets(submission, void 0, req).catch(console.error);
      res.json({ success: true });
    } catch (err) {
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
    } catch (e) {
    }
    res.json({ hasCredentials: false });
  });
  app.get("/api/google-test-connection", async (req, res) => {
    try {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        return res.json({
          status: "missing_credentials",
          message: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0641\u062A\u0627\u062D \u0627\u0639\u062A\u0645\u0627\u062F \u062C\u0648\u062C\u0644 \u0633\u062D\u0627\u0628\u064A (GOOGLE_APPLICATION_CREDENTIALS_JSON) \u0641\u064A \u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0628\u064A\u0626\u0629."
        });
      }
      const { google } = await import("googleapis");
      const settings = loadData(SETTINGS_FILE);
      const activeTemplateId = settings?.activeFormTemplateId;
      const template = settings?.formTemplates?.find((t) => t.id === activeTemplateId);
      const spreadsheetId = template?.spreadsheetId || settings?.spreadsheetId;
      const fileFolderId = template?.filesFolderId || settings?.googleDriveFolderId;
      if (!spreadsheetId) {
        return res.json({
          status: "missing_settings",
          message: "\u0644\u0645 \u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062F \u0645\u0639\u0631\u0651\u0641 \u0645\u0644\u0641 Google Sheets \u0641\u064A \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A."
        });
      }
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive"
        ]
      });
      const sheets = google.sheets({ version: "v4", auth });
      const drive = google.drive({ version: "v3", auth });
      let sheetTitle = "Sheet1";
      try {
        const spreadSheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        sheetTitle = spreadSheetMeta.data.sheets?.[0]?.properties?.title || "Sheet1";
      } catch (sheetErr) {
        if (sheetErr.status === 403 || sheetErr.message?.includes("permission")) {
          return res.json({
            status: "permission_denied",
            email: credentials.client_email,
            message: `\u0641\u0634\u0644 \u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0644\u0645\u0644\u0641: \u064A\u0631\u062C\u0649 \u0645\u0634\u0627\u0631\u0643\u0629 \u0645\u0633\u062A\u0646\u062F Google Sheet \u0627\u0644\u062E\u0627\u0635 \u0628\u0643 (ID: ${spreadsheetId}) \u0645\u0639 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0623\u062F\u0646\u0627\u0647 \u0643\u0640 Editor (\u0645\u062D\u0631\u0631):`
          });
        }
        throw sheetErr;
      }
      let folderAccess = "no_folder";
      if (fileFolderId) {
        try {
          await drive.files.get({
            fileId: fileFolderId,
            fields: "id, name",
            supportsAllDrives: true
          });
          folderAccess = "success";
        } catch (driveErr) {
          folderAccess = "permission_denied";
        }
      }
      return res.json({
        status: "success",
        sheetTitle,
        folderAccess,
        clientEmail: credentials.client_email,
        message: "\u062A\u0645 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0646\u062C\u0627\u062D \u062A\u0627\u0645! \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629 \u064A\u0645\u062A\u0644\u0643 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0643\u0627\u0645\u0644\u0629 \u0644\u0644\u0648\u0635\u0648\u0644 \u0648\u062A\u0639\u062F\u064A\u0644 \u0645\u0644\u0641 Google Sheet \u0648\u0645\u062C\u0644\u062F \u0627\u0644\u062F\u0631\u0627\u064A\u0641 \u0627\u0644\u0645\u0639\u064A\u0646\u064A\u0646."
      });
    } catch (e) {
      console.error("[Test Connection Error]:", e);
      res.json({
        status: "error",
        message: e.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u062A\u0648\u0642\u0639 \u0623\u062B\u0646\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u062A\u062D\u0642\u0642."
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
        } catch (err) {
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
    } catch (error) {
      console.error("Bulk sync error:", error);
      res.status(500).json({ error: error.message || "Bulk sync failed" });
    }
  });
  app.post("/api/simulate-submission", async (req, res) => {
    const logs = [];
    const log = (msg) => {
      const stamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("ar-EG", { hour12: false });
      logs.push(`[${stamp}] ${msg}`);
      console.log(`[SIMULATION] ${msg}`);
    };
    try {
      log("\u0628\u062F\u0621 \u0645\u062D\u0627\u0643\u0627\u0629 \u062A\u0633\u062C\u064A\u0644 \u0632\u0627\u0626\u0631 \u0644\u0637\u0644\u0628 \u062C\u062F\u064A\u062F...");
      const settings = loadData(SETTINGS_FILE);
      const activeTemplateId = settings?.activeFormTemplateId;
      const template = settings?.formTemplates?.find((t) => t.id === activeTemplateId);
      const names = ["\u0623\u062D\u0645\u062F \u0643\u0631\u064A\u0645 \u064A\u0648\u0633\u0641 \u0627\u0644\u062C\u0627\u0631\u062D\u064A", "\u0645\u062D\u0645\u062F \u0639\u0644\u064A \u0645\u062D\u0645\u0648\u062F \u0627\u0644\u0634\u0627\u0641\u0639\u064A", "\u062E\u0627\u0644\u062F \u0648\u0644\u064A\u062F \u0641\u0627\u0631\u0648\u0642 \u0627\u0644\u0646\u062C\u0627\u0631", "\u0639\u0628\u062F \u0627\u0644\u0631\u062D\u0645\u0646 \u0637\u0627\u0631\u0642 \u0635\u0641\u0648\u062A \u0627\u0644\u062C\u0645\u0644", "\u064A\u0648\u0633\u0641 \u0631\u0623\u0641\u062A \u0627\u0644\u062C\u0645\u0644 \u0633\u0644\u064A\u0645", "\u0632\u064A\u0627\u062F \u062D\u0627\u0632\u0645 \u0627\u0644\u0634\u0631\u064A\u0641 \u0627\u0644\u0634\u0627\u0641\u064A"];
      const provinces = ["\u0627\u0644\u0642\u0627\u0647\u0631\u0629", "\u0627\u0644\u062C\u064A\u0632\u0629", "\u0627\u0644\u0625\u0633\u0643\u0646\u062F\u0631\u064A\u0629", "\u0627\u0644\u062F\u0642\u0647\u0644\u064A\u0629", "\u0627\u0644\u063A\u0631\u0628\u064A\u0629", "\u0627\u0644\u0645\u0646\u0648\u0641\u064A\u0629"];
      const motherNames = ["\u0645\u0646\u0649 \u0639\u0628\u062F \u0627\u0644\u0645\u0646\u0639\u0645 \u0633\u0644\u064A\u0645", "\u0646\u0627\u062F\u064A\u0629 \u062D\u0633\u0646 \u0627\u0644\u0634\u0627\u0641\u0639\u064A", "\u0645\u0631\u064A\u0645 \u0643\u0645\u0627\u0644 \u0627\u0644\u0646\u062C\u0627\u0631", "\u0648\u0641\u0627\u0621 \u0633\u0645\u064A\u0631 \u0627\u0644\u062F\u064A\u0628"];
      const fatherJobs = ["\u0645\u0647\u0646\u062F\u0633 \u0628\u0631\u0645\u062C\u064A\u0627\u062A", "\u0645\u062D\u0627\u0633\u0628 \u0645\u0627\u0644\u064A", "\u0645\u062F\u0631\u0633 \u0644\u063A\u0629 \u0639\u0631\u0628\u064A\u0629", "\u0637\u0628\u064A\u0628 \u0639\u0627\u0645", "\u062A\u0627\u062C\u0631 \u062A\u062C\u0632\u0626\u0629"];
      const randomSelect = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const tempId = Math.floor(1e5 + Math.random() * 9e5);
      const regNum = `SIM-${tempId}`;
      const fullName = randomSelect(names);
      log(`\u062A\u0648\u0644\u064A\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0637\u0627\u0644\u0628 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629: ${fullName}`);
      log(`\u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u0648\u0644\u062F \u0644\u0644\u0645\u062D\u0627\u0643\u0627\u0629: ${regNum}`);
      const mockStudent = {
        id: crypto.randomUUID(),
        registrationNumber: regNum,
        fullName,
        province: randomSelect(provinces),
        dob: "2010-05-15",
        nationalId: `3100515${Math.floor(1e6 + Math.random() * 9e6)}`,
        score: Math.floor(250 + Math.random() * 30),
        fatherName: `${fullName.split(" ").slice(1).join(" ")}`,
        fatherJob: randomSelect(fatherJobs),
        motherName: randomSelect(motherNames),
        motherJob: "\u0631\u0628\u0629 \u0645\u0646\u0632\u0644",
        phone: `01${Math.floor(1e8 + Math.random() * 9e8)}`,
        status: "PENDING",
        submissionDate: (/* @__PURE__ */ new Date()).toISOString(),
        cloudSynced: false,
        documents: {},
        customData: {}
      };
      log("\u062A\u0623\u0645\u064A\u0646 \u0645\u0633\u0627\u0631 \u0627\u0644\u0631\u0641\u0639 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0648\u0627\u0644\u0645\u062C\u0644\u062F \u0627\u0644\u062E\u0627\u0635 \u0628\u0627\u0644\u0637\u0627\u0644\u0628 \u0641\u064A \u0627\u0644\u0633\u064A\u0631\u0641\u0631...");
      const studentUploadDir = import_path.default.join(UPLOADS_DIR, String(regNum));
      if (!import_fs.default.existsSync(studentUploadDir)) {
        import_fs.default.mkdirSync(studentUploadDir, { recursive: true });
        log("\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u062C\u0644\u062F \u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0646\u062C\u0627\u062D \u0639\u0644\u0649 \u0645\u0633\u0627\u0631 \u0627\u0644\u062E\u0627\u062F\u0645 \u0627\u0644\u0645\u062D\u0644\u064A.");
      }
      const mockPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const systemDocsKeys = ["personalPhoto", "birthCertificate", "prepCertificate", "parentNationalId"];
      log("\u0645\u062D\u0627\u0643\u0627\u0629 \u0631\u0641\u0639 \u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629 \u0648\u062A\u062D\u0648\u064A\u0644\u0647\u0627 \u0625\u0644\u0649 \u0645\u0644\u0641\u0627\u062A \u0641\u064A\u0632\u064A\u0627\u0626\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0647\u0627\u0631\u062F \u062F\u064A\u0633\u0643...");
      for (const key of systemDocsKeys) {
        const buffer = Buffer.from(mockPngBase64.replace(/^data:image\/png;base64,/, ""), "base64");
        const filePath = import_path.default.join(studentUploadDir, `${key}.png`);
        import_fs.default.writeFileSync(filePath, buffer);
        const host = getRequestHost(req);
        mockStudent.documents[key] = `${host}/api/student-files/${regNum}/${key}`;
        log(`\u062D\u0641\u0638 \u0627\u0644\u0645\u0633\u062A\u0646\u062F [${key}] \u0628\u0631\u0627\u0628\u0637 \u0645\u062D\u0644\u064A: ${mockStudent.documents[key]}`);
      }
      const activeFields = template?.formFields || settings?.formFields || [];
      for (const f of activeFields) {
        if (systemDocsKeys.includes(f.id)) continue;
        if (f.type === "file" || f.type === "image") {
          const buffer = Buffer.from(mockPngBase64.replace(/^data:image\/png;base64,/, ""), "base64");
          const filePath = import_path.default.join(studentUploadDir, `${f.id}.png`);
          import_fs.default.writeFileSync(filePath, buffer);
          const host = getRequestHost(req);
          mockStudent.customData[f.id] = {
            name: "simulated_upload.png",
            type: "image/png",
            size: 1024,
            dataUrl: `${host}/api/student-files/${regNum}/${f.id}`
          };
          log(`\u062D\u0641\u0638 \u0627\u0644\u0645\u0633\u062A\u0646\u062F \u0627\u0644\u0625\u0636\u0627\u0641\u064A \u0627\u0644\u0645\u062E\u0635\u0635 [${f.label}] \u0628\u0631\u0627\u0628\u0637 \u0645\u062D\u0644\u064A: ${mockStudent.customData[f.id].dataUrl}`);
        } else {
          mockStudent.customData[f.id] = f.type === "number" ? Math.floor(10 + Math.random() * 90) : `\u0642\u064A\u0645\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629 (${f.label})`;
        }
      }
      log("\u062D\u0641\u0638 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u062C\u062F\u064A\u062F \u0628\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0644\u0644\u062A\u062D\u0636\u064A\u0631 \u0644\u0645\u0632\u0627\u0645\u0646\u062A\u0647...");
      const allSubmissions = loadData(SUBMISSIONS_FILE) || [];
      allSubmissions.push(mockStudent);
      saveData(SUBMISSIONS_FILE, allSubmissions);
      log(`\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0637\u0644\u0628 \u0648\u062D\u0641\u0638\u0647 \u0628\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0628\u0631\u0642\u0645 \u0641\u0631\u064A\u062F.`);
      const spreadsheetId = template?.spreadsheetId || settings?.spreadsheetId;
      const fileFolderId = template?.filesFolderId || settings?.googleDriveFolderId;
      if (!spreadsheetId) {
        log("\u274C \u062E\u0637\u0623: \u0644\u0645 \u064A\u062A\u0645 \u062A\u0647\u064A\u0626\u0629 \u0645\u0639\u0631\u0641 \u0648\u0631\u0642\u0629 \u062C\u0648\u062C\u0644 \u0634\u064A\u062A\u0633 (Spreadsheet ID \u0645\u0641\u0642\u0648\u062F \u0641\u064A \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629)!");
        throw new Error("Missing spreadsheetId");
      }
      log("\u0628\u062F\u0621 \u0645\u0631\u062D\u0644\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u062C\u0648\u062C\u0644 \u062F\u0631\u0627\u064A\u0641 \u0648\u062C\u0648\u062C\u0644 \u0634\u064A\u062A\u0633 \u0644\u0644\u0645\u0632\u0627\u0645\u0646\u0629...");
      let auth;
      const { google } = await import("googleapis");
      const { Readable } = await import("stream");
      const localCached = loadCachedGoogleToken();
      const { googleToken } = req.body || {};
      const tokenToUse = googleToken || (localCached && Date.now() - localCached.savedAt < 50 * 60 * 1e3 ? localCached.token : null);
      if (tokenToUse) {
        log("\u0645\u0633\u062A\u0646\u062F \u0627\u0644\u062F\u0644\u064A\u0644: \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0631\u0645\u0632 \u0648\u0635\u0648\u0644 \u0627\u0644\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0646\u0634\u0637 \u0648\u0627\u0644\u0645\u0635\u0631\u062D \u0644\u0647 \u0645\u0646 \u0627\u0644\u0645\u062A\u0635\u0641\u062D...");
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: tokenToUse });
        auth = oauth2Client;
      } else {
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
          log("\u274C \u062E\u0637\u0623: \u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0633\u064A\u0631\u0641\u0631 (GOOGLE_APPLICATION_CREDENTIALS_JSON) \u0648\u062A\u0648\u0643\u0646 \u0627\u0644\u062A\u062E\u0648\u064A\u0644 \u0644\u062C\u0644\u0633\u0629 \u0627\u0644\u0645\u0634\u0631\u0641 \u0643\u0644\u0627\u0647\u0645\u0627 \u0645\u0641\u0642\u0648\u062F\u0627\u0646!");
          throw new Error("\u062A\u062A\u0637\u0644\u0628 \u0627\u0644\u0645\u062D\u0627\u0643\u0627\u0629 \u0625\u0645\u0627 \u062C\u0644\u0633\u0629 \u062C\u0648\u062C\u0644 \u0646\u0634\u0637\u0629 \u0644\u0644\u0627\u062F\u0645\u0646 \u0623\u0648 \u0645\u0644\u0641 \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u062E\u0644\u0641\u064A.");
        }
        log("\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0628\u0631\u0648\u062A\u0648\u0643\u0648\u0644 \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u062E\u0644\u0641\u064A \u0648\u0645\u062C\u0645\u0648\u0639\u0629 \u0645\u0641\u0627\u062A\u064A\u062D Google Application Credentials...");
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
          ]
        });
      }
      const sheets = google.sheets({ version: "v4", auth });
      const drive = google.drive({ version: "v3", auth });
      log("\u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0633\u062D\u0627\u0628\u064A \u0628\u0648\u0631\u0642\u0629 \u062C\u0648\u062C\u0644 \u0634\u064A\u062A \u0648\u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u062A\u0628\u0648\u064A\u0628\u0627\u062A...");
      let sheetTitle = "Sheet1";
      try {
        const spreadSheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        sheetTitle = spreadSheetMeta.data.sheets?.[0]?.properties?.title || "Sheet1";
        log(`\u062A\u0645 \u062A\u0648\u0635\u064A\u0644 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0628\u0646\u062C\u0627\u062D \u0628\u0645\u0644\u0641 \u0627\u0644\u0634\u064A\u062A\u0633! \u0627\u0633\u0645 \u062A\u0628\u0648\u064A\u0628 \u0627\u0644\u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0646\u0634\u0637: [${sheetTitle}]`);
      } catch (metaErr) {
        log(`\u274C \u0641\u0634\u0644 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0631\u0627\u0628\u0637 \u0627\u0644\u0634\u064A\u062A\u0633: ${metaErr.message}`);
        throw metaErr;
      }
      let studentFolderId = fileFolderId;
      if (fileFolderId) {
        log("\u0641\u062D\u0635 \u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0631\u0626\u064A\u0633\u064A \u0644\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062A\u0633\u0644\u0633\u0644 \u0627\u0644\u0634\u062C\u0631\u064A \u0627\u0644\u0645\u062E\u0635\u0635 \u0644\u0644\u0637\u0627\u0644\u0628 \u0628\u062C\u0648\u062C\u0644 \u062F\u0631\u0627\u064A\u0641...");
        const formName = template?.name || settings?.schoolName || "\u0627\u0644\u0627\u0633\u062A\u0645\u0627\u0631\u0629";
        const folderName = `${mockStudent.registrationNumber}_${mockStudent.fullName}`;
        try {
          let formFolderId = fileFolderId;
          const qForm = `name = '${formName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${fileFolderId}' in parents and trashed = false`;
          const existingForm = await drive.files.list({
            q: qForm,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
          if (existingForm.data.files && existingForm.data.files.length > 0) {
            formFolderId = existingForm.data.files[0].id;
            log(`\u062A\u0645 \u0645\u0637\u0627\u0628\u0642\u0629 \u0645\u062C\u0644\u062F \u0627\u0644\u0627\u0633\u062A\u0645\u0627\u0631\u0629 \u0628\u062C\u0648\u062C\u0644 \u062F\u0631\u0627\u064A\u0641: ID [${formFolderId}]`);
          } else {
            log(`\u0645\u062C\u0644\u062F \u0627\u0644\u0627\u0633\u062A\u0645\u0627\u0631\u0629 \u0645\u0641\u0642\u0648\u062F\u060C \u062C\u0627\u0631\u064A \u0625\u0646\u0634\u0627\u0621 \u0645\u062C\u0644\u062F \u062C\u062F\u064A\u062F \u0628\u0627\u0633\u0645: [${formName}]`);
            const formFolderMeta = {
              name: formName,
              mimeType: "application/vnd.google-apps.folder",
              parents: [fileFolderId]
            };
            const fFormCreated = await drive.files.create({
              requestBody: formFolderMeta,
              fields: "id",
              supportsAllDrives: true
            });
            formFolderId = fFormCreated.data.id;
            log(`\u0645\u062E\u0631\u062C\u0627\u062A \u062C\u0648\u062C\u0644 \u062F\u0631\u0627\u064A\u0641: \u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u062C\u0644\u062F \u0627\u0644\u0627\u0633\u062A\u0645\u0627\u0631\u0629 \u0628\u0648\u0636\u0639 \u0627\u0644\u0645\u0639\u0631\u0641: ID [${formFolderId}]`);
          }
          const qStudent = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${formFolderId}' in parents and trashed = false`;
          const existingStudent = await drive.files.list({
            q: qStudent,
            fields: "files(id)",
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          });
          if (existingStudent.data.files && existingStudent.data.files.length > 0) {
            studentFolderId = existingStudent.data.files[0].id;
            log(`\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u0645\u062C\u0644\u062F \u0627\u0644\u0637\u0627\u0644\u0628 \u0645\u0633\u0628\u0642\u0627\u064B \u0628\u062C\u0648\u062C\u0644 \u062F\u0631\u0627\u064A\u0641: ID [${studentFolderId}]`);
          } else {
            log(`\u062C\u0627\u0631\u064A \u0625\u0646\u0634\u0627\u0621 \u0645\u062C\u0644\u062F \u062E\u0627\u0635 \u0628\u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0627\u0633\u0645: [${folderName}]...`);
            const studentFolderMeta = {
              name: folderName,
              mimeType: "application/vnd.google-apps.folder",
              parents: [formFolderId]
            };
            const fStudentCreated = await drive.files.create({
              requestBody: studentFolderMeta,
              fields: "id",
              supportsAllDrives: true
            });
            studentFolderId = fStudentCreated.data.id;
            log(`\u0645\u062E\u0631\u062C\u0627\u062A \u062C\u0648\u062C\u0644 \u062F\u0631\u0627\u064A\u0641: \u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u062C\u0644\u062F \u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0646\u062C\u0627\u062D: ID [${studentFolderId}]`);
          }
        } catch (folderErr) {
          log(`\u26A0\uFE0F \u062A\u0646\u0628\u064A\u0647: \u0641\u0634\u0644 \u062A\u062E\u0644\u064A\u0642 \u0645\u062C\u0644\u062F\u0627\u062A \u0627\u0644\u0637\u0627\u0644\u0628 \u0628\u0633\u0628\u0628 \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u062C\u0644\u062F \u0627\u0644\u0623\u0628. \u0633\u064A\u062A\u0645 \u0627\u0644\u0631\u0641\u0639 \u0644\u0644\u0645\u062C\u0644\u062F \u0627\u0644\u0639\u0627\u0645: ${folderErr.message}`);
        }
      } else {
        log("\u26A0\uFE0F \u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0639\u0631\u0641 \u0645\u062C\u0644\u062F \u062F\u0631\u0627\u064A\u0641 \u0631\u0626\u064A\u0633\u064A \u0641\u064A \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A\u060C \u0633\u064A\u062A\u0645 \u062A\u062E\u0637\u064A \u062A\u0647\u064A\u0626\u0629 \u0645\u062C\u0644\u062F\u0627\u062A \u0627\u0644\u0637\u0644\u0627\u0628 \u0627\u0644\u0645\u0631\u0641\u0642\u0629.");
      }
      const uploadMockFileToDrive = async (fileName, key, label) => {
        try {
          log(`\u0645\u0639\u0627\u0644\u062C\u0629 \u0648\u062A\u062D\u0636\u064A\u0631 \u0645\u0633\u062A\u0646\u062F [${label}] \u0644\u0644\u0631\u0641\u0639 \u0627\u0644\u0641\u0648\u0631\u064A...`);
          const filePath = import_path.default.join(studentUploadDir, `${key}.png`);
          if (!import_fs.default.existsSync(filePath)) {
            log(`\u274C \u062E\u0637\u0623: \u062A\u0639\u0630\u0631 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u062D\u0644\u064A \u0627\u0644\u0645\u0648\u0644\u062F \u0644\u0640 [${label}]`);
            return "";
          }
          const fileMetadata = {
            name: fileName,
            parents: studentFolderId ? [studentFolderId] : []
          };
          const buffer = import_fs.default.readFileSync(filePath);
          const media = {
            mimeType: "image/png",
            body: Readable.from(buffer)
          };
          log(`\u062C\u0627\u0631\u064A \u0627\u0633\u062A\u062F\u0639\u0627\u0621 Google Drive API \u0644\u0631\u0641\u0639 \u0645\u0644\u0641 [${fileName}]...`);
          const gResponse = await drive.files.create({
            requestBody: fileMetadata,
            media,
            fields: "id, webViewLink",
            supportsAllDrives: true
          });
          const link = gResponse.data.webViewLink || `https://drive.google.com/open?id=${gResponse.data.id}`;
          log(`\u2705 \u062A\u0645 \u0627\u0644\u0631\u0641\u0639 \u0628\u0646\u062C\u0627\u062D! \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0633\u062D\u0627\u0628\u064A: ${link}`);
          return link;
        } catch (err) {
          log(`\u274C \u0641\u0634\u0644 \u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u062A\u0646\u062F [${label}] \u0625\u0644\u0649 \u062F\u0631\u0627\u064A\u0641: ${err.message}`);
          return "";
        }
      };
      const systemDocsOutputs = {};
      for (const doc of [
        { key: "personalPhoto", name: "photo", label: "\u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0634\u062E\u0635\u064A\u0629" },
        { key: "birthCertificate", name: "birth", label: "\u0634\u0647\u0627\u062F\u0629 \u0627\u0644\u0645\u064A\u0644\u0627\u062F" },
        { key: "prepCertificate", name: "prep", label: "\u0634\u0647\u0627\u062F\u0629 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u064A\u0629" },
        { key: "parentNationalId", name: "parent_id", label: "\u0628\u0637\u0627\u0642\u0629 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631" }
      ]) {
        const fileTitle = `${doc.name}_${regNum}.png`;
        const driveUrl = await uploadMockFileToDrive(fileTitle, doc.key, doc.label);
        if (driveUrl) {
          systemDocsOutputs[doc.key] = driveUrl;
        }
      }
      const customDocsOutputs = {};
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
      const updatedIdx = reSubmissions.findIndex((s) => s.registrationNumber === regNum);
      if (updatedIdx > -1) {
        reSubmissions[updatedIdx].documents = finalDocLinks;
        reSubmissions[updatedIdx].customData = finalCustomLinks;
        reSubmissions[updatedIdx].cloudSynced = true;
        saveData(SUBMISSIONS_FILE, reSubmissions);
        log("\u062A\u062D\u062F\u064A\u062B \u0646\u0627\u062C\u062D \u0644\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0628\u0631\u0648\u0627\u0628\u0637 \u062C\u0648\u062C\u0644 \u062F\u0631\u0627\u064A\u0641 \u0627\u0644\u0633\u062D\u0627\u0628\u064A\u0629.");
      }
      log("\u0627\u0633\u062A\u062E\u0644\u0627\u0635 \u062D\u0642\u0648\u0644 \u0648\u0645\u0637\u0627\u0628\u0642\u0629 \u0623\u0639\u0645\u062F\u0629 \u0648\u0631\u0642\u0629 Google Sheets...");
      let headers = [];
      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A1:Z1`
        });
        headers = headerResponse.data.values?.[0] || [];
        log(`\u0645\u0635\u0641\u0648\u0641\u0629 \u062D\u0642\u0648\u0644 \u0627\u0644\u0634\u064A\u062A\u0633 \u0627\u0644\u0645\u0644\u062A\u0642\u0637\u0629: [${headers.join(", ")}]`);
      } catch (err) {
        log(`\u26A0\uFE0F \u062A\u0646\u0628\u064A\u0647: \u062A\u0639\u0630\u0631 \u062A\u062A\u0628\u0639 \u0627\u0644\u0623\u0639\u0645\u062F\u0629 \u0644\u0644\u062A\u0637\u0627\u0628\u0642 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A\u060C \u0633\u064A\u062A\u0645 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A: ${err.message}`);
      }
      const statusArabic = "\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629";
      const normalize = (s) => s ? s.replace(/\s+/g, "").toLowerCase() : "";
      const headerMap = {
        "id": mockStudent.id,
        "registrationnumber": mockStudent.registrationNumber,
        "\u0643\u0648\u062F\u0627\u0644\u0637\u0644\u0628": mockStudent.registrationNumber,
        "\u0627\u0644\u0631\u0642\u0645\u0627\u0644\u062A\u0633\u062C\u064A\u0644\u0649": mockStudent.registrationNumber,
        "\u0627\u0644\u0627\u0633\u0645\u0631\u0628\u0627\u0639\u064A": mockStudent.fullName,
        "\u0627\u0644\u0627\u0633\u0645": mockStudent.fullName,
        "\u0627\u0633\u0645\u0637\u0627\u0644\u0628": mockStudent.fullName,
        "\u0627\u0644\u0645\u062D\u0627\u0641\u0638\u0629": mockStudent.province,
        "\u062A\u0627\u0631\u064A\u062E\u0627\u0644\u0645\u064A\u0644\u0627\u062F": mockStudent.dob,
        "\u0627\u0644\u0631\u0642\u0645\u0627\u0644\u0642\u0648\u0645\u064A": mockStudent.nationalId,
        "\u0627\u0644\u0645\u062C\u0645\u0648\u0639": String(mockStudent.score),
        "\u0645\u062C\u0645\u0648\u0639\u062F\u0631\u062C\u0627\u062A": String(mockStudent.score),
        "\u062D\u0627\u0644\u0629\u0627\u0644\u0637\u0644\u0628": statusArabic,
        "\u062D\u0627\u0644\u0629": statusArabic,
        "\u0627\u0644\u062D\u0627\u0644\u0629": statusArabic,
        "\u0627\u0633\u0645\u0648\u0644\u064A\u0627\u0644\u0623\u0645\u0631": mockStudent.fatherName,
        "\u0631\u0642\u0645\u0627\u0644\u0645\u0648\u0628\u0627\u064A\u0644": mockStudent.phone,
        "\u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A": Object.values(finalDocLinks).join("\n"),
        "\u0627\u0644\u0635\u0648\u0631\u0629\u0627\u0644\u0634\u062E\u0635\u064A\u0629": finalDocLinks.personalPhoto || "",
        "\u0634\u0647\u0627\u062F\u0629\u0627\u0644\u0645\u064A\u0644\u0627\u062F": finalDocLinks.birthCertificate || "",
        "\u062A\u0627\u0631\u064A\u062E\u0627\u0644\u062A\u0642\u062F\u064A\u0645": mockStudent.submissionDate
      };
      let rowValues = [];
      if (headers.length > 0) {
        rowValues = headers.map((h) => {
          const normHeader = normalize(h);
          if (headerMap[normHeader] !== void 0) {
            return headerMap[normHeader];
          }
          const matchedField = activeFields.find((f) => normalize(f.label) === normHeader);
          if (matchedField) {
            const customVal = finalCustomLinks[matchedField.id];
            if (customVal && typeof customVal === "object") {
              return customVal.dataUrl || customVal.url || "";
            }
            return customVal ? String(customVal) : "";
          }
          return "";
        });
        log("\u062A\u0645 \u0635\u064A\u0627\u063A\u0629 \u0627\u0644\u062E\u0644\u0627\u064A\u0627 \u0648\u0645\u0644\u0627\u0621\u0645\u0629 \u0643\u0627\u0641\u0629 \u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0645\u0644\u0641\u0627\u062A \u0645\u0639 \u062A\u0631\u0648\u064A\u0633\u0629 \u0648\u0631\u0642\u0629 \u0627\u0644\u0639\u0645\u0644.");
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
        log("\u062A\u0645 \u0635\u064A\u0627\u063A\u0629 \u0627\u0644\u0635\u0641 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A \u0628\u0627\u0644\u0647\u064A\u0643\u0644 \u0627\u0644\u0642\u064A\u0627\u0633\u064A \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A.");
      }
      log("\u0643\u062A\u0627\u0628\u0629 \u0648\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0635\u0641 \u0627\u0644\u062C\u062F\u064A\u062F \u0625\u0644\u0649 Google Sheets...");
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetTitle}!A:A`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [rowValues]
        }
      });
      log("\u{1F389} \u062A\u0645\u062A \u0643\u062A\u0627\u0628\u0629 \u0627\u0644\u0635\u0641 \u0648\u0625\u062B\u0628\u0627\u062A \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0628\u0646\u062C\u0627\u062D \u0641\u064A \u0648\u0631\u0642\u0629 Google Sheets!");
      log("\u0627\u0644\u0645\u062D\u0627\u0643\u0627\u0629 \u0648\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0623\u0645\u0627\u0646 \u0648\u0627\u0644\u0631\u0628\u0637 \u0633\u0644\u064A\u0645 \u0648\u0628\u062F\u0648\u0646 \u0623\u062E\u0637\u0627\u0621!");
      res.json({
        success: true,
        regNum,
        fullName,
        logs,
        driveFolderUrl: studentFolderId ? `https://drive.google.com/drive/folders/${studentFolderId}` : `https://drive.google.com/drive/folders/${fileFolderId}`,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        uploadedFiles: finalDocLinks
      });
    } catch (err) {
      log(`\u274C \u062E\u0637\u0623 \u0641\u0627\u062F\u062D \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0643\u0627\u0629: ${err.message || err}`);
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
    const index = all.findIndex((u) => u.uid === user.uid || u.email === user.email);
    if (index > -1) all[index] = { ...all[index], ...user };
    else all.push(user);
    saveData(USERS_FILE, all);
    res.json({ success: true });
  });
  app.post("/api/generate-exam", async (req, res) => {
    try {
      const { prompt, fileData, mimeType, structure } = req.body;
      const contents = [];
      if (fileData && mimeType) {
        contents.push({
          inlineData: {
            data: fileData,
            mimeType
          }
        });
      }
      let structurePrompt = "";
      if (structure && Array.isArray(structure)) {
        structurePrompt = `The exam MUST exactly contain the following numbers and types of questions:
        ${structure.map((b) => `- ${b.itemCount} questions of type ${b.type}`).join("\n")}
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
            type: import_genai.Type.OBJECT,
            properties: {
              title: { type: import_genai.Type.STRING },
              questions: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    type: {
                      type: import_genai.Type.STRING,
                      enum: ["TRUE_FALSE", "MULTIPLE_CHOICE", "MATCHING", "ESSAY"]
                    },
                    text: { type: import_genai.Type.STRING },
                    options: {
                      type: import_genai.Type.ARRAY,
                      items: { type: import_genai.Type.STRING }
                    },
                    matchingPairs: {
                      type: import_genai.Type.ARRAY,
                      items: {
                        type: import_genai.Type.OBJECT,
                        properties: {
                          left: { type: import_genai.Type.STRING },
                          right: { type: import_genai.Type.STRING }
                        }
                      }
                    },
                    correctAnswer: { type: import_genai.Type.STRING },
                    points: { type: import_genai.Type.NUMBER }
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
    } catch (error) {
      console.error("Gemini Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate exam" });
    }
  });
  const isProdEnv = process.env.NODE_ENV === "production";
  const distPath = import_path.default.resolve(process.cwd(), "dist");
  const indexExists = import_fs.default.existsSync(import_path.default.join(distPath, "index.html"));
  const useStatic = isProdEnv || indexExists && process.env.VITE_DEV !== "true";
  console.log("[Server] Diagnosis:", {
    NODE_ENV: process.env.NODE_ENV,
    isProdEnv,
    useStatic,
    distPath,
    indexExists
  });
  if (useStatic) {
    console.log("[Server] Static Mode: Serving from", distPath);
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API Route Not Found" });
      }
      const indexPath = import_path.default.join(distPath, "index.html");
      if (import_fs.default.existsSync(indexPath)) {
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
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("[Server] Critical: Failed to load Vite middleware", e);
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
//# sourceMappingURL=server.cjs.map
