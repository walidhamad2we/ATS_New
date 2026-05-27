/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentApplication, Exam, ExamSubmission, SystemSettings, FormField, FormTemplate, ExamResultRow } from '../types';
import { get, set, del } from 'idb-keyval';
import { getApiUrl } from './api';

const STORAGE_KEYS = {
  APPLICATIONS: 'admission_applications',
  EXAMS: 'admission_exams',
  SUBMISSIONS: 'admission_submissions',
  SETTINGS: 'admission_settings',
  CURRENT_USER: 'admission_current_user',
};

// In-memory cache for synchronous access after initialization
let applicationsCache: StudentApplication[] = [];
let submissionsCache: ExamSubmission[] = [];
let examsCache: Exam[] = [];
let isInitialized = false;

const DEFAULT_FIELDS: FormField[] = [
  { id: 'fullName', label: 'الاسم رباعي', type: 'text', required: true, system: true, validationType: 'name' },
  { id: 'province', label: 'المحافظة', type: 'select', required: true, system: true, options: [
    'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم', 
    'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد', 'الشرقية', 
    'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'جنوب سيناء', 'كفر الشيخ', 
    'مطروح', 'قنا', 'شمال سيناء', 'سوهاج', 'الأقصر'
  ] },
  { id: 'dob', label: 'تاريخ الميلاد', type: 'date', required: true, system: true },
  { id: 'nationalId', label: 'الرقم القومي', type: 'text', required: true, system: true, validationType: 'national_id' },
  { id: 'score', label: 'المجموع الكلي', type: 'number', required: true, system: true, minNumber: 140, maxNumber: 280 },
  { id: 'phone', label: 'رقم الموبايل', type: 'text', required: true, system: true, validationType: 'phone' },
  { id: 'fatherName', label: 'اسم ولي الأمر', type: 'text', required: true, system: true, validationType: 'name' },
  { id: 'fatherJob', label: 'عمل ولي الأمر', type: 'text', required: true, system: true },
  { id: 'motherName', label: 'اسم الام', type: 'text', required: true, system: true, validationType: 'name' },
  { id: 'motherJob', label: 'عمل الام', type: 'text', required: true, system: true },
  { id: 'personalPhoto', label: 'صورة شخصية للطالب مدون عليها الاسم', type: 'image', required: true, system: true },
  { id: 'birthCertificate', label: 'شهادة الميلاد', type: 'image', required: true, system: true },
  { id: 'prepCertificate', label: 'صورة شهادة إتمام المرحلة الإعدادية', type: 'image', required: true, system: true },
  { id: 'parentNationalId', label: 'صورة الرقم القومي لولي الأمر', type: 'image', required: true, system: true },
];

const DEFAULT_TEMPLATES: FormTemplate[] = [
  {
    id: 'default-form',
    name: 'استمارة تكنولوجيا الحاسبات والاتصالات',
    formFields: [
      ...DEFAULT_FIELDS
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'mech-form',
    name: 'استمارة شعبة الميكاترونكس والسيارات',
    formFields: [
      ...DEFAULT_FIELDS,
      { id: 'interest', label: 'الخبرة السابقة في الميكانيكا والورش والربوتات', type: 'select', required: true, options: ['مبتدئ تماماً', 'عضو سابق في نادي العلوم', 'لدى مهارات فك وتصليح في المنزل'] },
      { id: 'safety-size', label: 'مقاس الحذاء الرسمي للورش الأكاديمية (السيفتي)', type: 'number', required: true }
    ],
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_SETTINGS: SystemSettings = {
  registrationOpen: true,
  formFields: DEFAULT_FIELDS,
  activeFormTemplateId: 'default-form',
  formTemplates: DEFAULT_TEMPLATES,
};

export const storage = {
  init: async (force = false) => {
    if (isInitialized && !force) return;
    
    // 1. Try to load from Server API
    try {
      const [serverApps, serverSettings] = await Promise.all([
        fetch(getApiUrl('/api/submissions')).then(res => res.json()),
        fetch(getApiUrl('/api/settings')).then(res => res.json())
      ]);

      if (serverApps && Array.isArray(serverApps)) {
        applicationsCache = serverApps;
        await set(STORAGE_KEYS.APPLICATIONS, serverApps);
      }

      if (serverSettings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(serverSettings));
      }
    } catch (e) {
      console.warn("Could not sync with server, using local only", e);
    }

    const subs = await get<ExamSubmission[]>(STORAGE_KEYS.SUBMISSIONS);
    const exams = await get<Exam[]>(STORAGE_KEYS.EXAMS);
    
    // 2. Fallback to IndexedDB if Cache still empty
    if (applicationsCache.length === 0) {
      const apps = await get<StudentApplication[]>(STORAGE_KEYS.APPLICATIONS);
      if (apps) {
        applicationsCache = apps;
      }
    }

    if (!subs) {
      const localSubs = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
      if (localSubs) {
        submissionsCache = JSON.parse(localSubs);
        await set(STORAGE_KEYS.SUBMISSIONS, submissionsCache);
        localStorage.removeItem(STORAGE_KEYS.SUBMISSIONS);
      }
    } else {
      submissionsCache = subs;
    }

    if (!exams) {
      const localExams = localStorage.getItem(STORAGE_KEYS.EXAMS);
      if (localExams) {
        examsCache = JSON.parse(localExams);
        await set(STORAGE_KEYS.EXAMS, examsCache);
        localStorage.removeItem(STORAGE_KEYS.EXAMS);
      }
    } else {
      examsCache = exams;
    }

    isInitialized = true;
  },

  getApplications: (): StudentApplication[] => {
    return applicationsCache;
  },

  saveApplication: async (app: StudentApplication) => {
    const apps = [...storage.getApplications()];
    const index = apps.findIndex((a) => a.id === app.id);
    if (index > -1) {
      apps[index] = app;
    } else {
      apps.push(app);
    }
    applicationsCache = apps;
    
    // Save to Local
    await set(STORAGE_KEYS.APPLICATIONS, apps);
    
    // Save to Server (Shared)
    try {
      await fetch(getApiUrl('/api/submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(app)
      });
    } catch (e) {
      console.error("Server sync failed", e);
    }
  },

  saveApplications: async (apps: StudentApplication[]) => {
    applicationsCache = apps;
    await set(STORAGE_KEYS.APPLICATIONS, apps);
    
    // Optimization: Bulk save to server if needed
    try {
      await fetch(getApiUrl('/api/submissions/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apps)
      });
    } catch (e) {
      console.warn("Bulk server sync failed", e);
    }
  },

  getSettings: (): SystemSettings => {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const settings = data ? JSON.parse(data) : { ...DEFAULT_SETTINGS };
    try {
      if (!settings.formTemplates || settings.formTemplates.length === 0) {
        settings.formTemplates = [...DEFAULT_TEMPLATES];
      }
      if (!settings.activeFormTemplateId) {
        settings.activeFormTemplateId = 'default-form';
      }

      const updateProvinceField = (f: FormField): FormField => {
        if (f.id === 'province') {
          return {
            ...f,
            type: 'select',
            options: [
              'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر', 'البحيرة', 'الفيوم', 
              'الغربية', 'الإسماعيلية', 'المنوفية', 'المنيا', 'القليوبية', 'الوادي الجديد', 'الشرقية', 
              'السويس', 'أسوان', 'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'جنوب سيناء', 'كفر الشيخ', 
              'مطروح', 'قنا', 'شمال سيناء', 'سوهاج', 'الأقصر'
            ]
          };
        }
        return f;
      };

      if (settings.formFields) {
        settings.formFields = settings.formFields.filter((f: FormField) => f.id !== 'pref-major').map(updateProvinceField);
      }
      if (settings.formTemplates) {
        settings.formTemplates = settings.formTemplates.map((t: any) => ({
          ...t,
          formFields: t.formFields.filter((f: FormField) => f.id !== 'pref-major').map(updateProvinceField)
        }));
      }
    } catch (e) {
      settings.formTemplates = [...DEFAULT_TEMPLATES];
      settings.activeFormTemplateId = 'default-form';
    }
    return settings;
  },

  saveSettings: async (settings: SystemSettings) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    
    // Save to Server (Shared)
    try {
      await fetch(getApiUrl('/api/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    } catch (e) {
      console.error("Settings server sync failed", e);
    }
  },

  getActiveFormFields: (): FormField[] => {
    const settings = storage.getSettings();
    let fields: FormField[] = [];
    if (settings.activeFormTemplateId && settings.formTemplates) {
      const activeTemplate = settings.formTemplates.find(t => t.id === settings.activeFormTemplateId);
      if (activeTemplate) {
        fields = activeTemplate.formFields.filter(f => f.id !== 'pref-major');
      }
    }
    if (fields.length === 0) {
      fields = (settings.formFields || DEFAULT_FIELDS).filter(f => f.id !== 'pref-major');
    }
    
    // Enforce strict layout ordering to ensure correct pairs on desktop side-by-side
    const orderMap: Record<string, number> = {
      'fullName': 1, 'province': 2, 'dob': 3, 'nationalId': 4, 'score': 5, 'phone': 6, 
      'fatherName': 7, 'fatherJob': 8, 'motherName': 9, 'motherJob': 10, 
      'personalPhoto': 11, 'birthCertificate': 12, 'prepCertificate': 13, 'parentNationalId': 14
    };
    
    return [...fields].sort((a, b) => {
      const orderA = orderMap[a.id] || 999;
      const orderB = orderMap[b.id] || 999;
      return orderA - orderB;
    });
  },

  getActiveFormName: (): string => {
    const settings = storage.getSettings();
    if (settings.activeFormTemplateId && settings.formTemplates) {
      const activeTemplate = settings.formTemplates.find(t => t.id === settings.activeFormTemplateId);
      if (activeTemplate) {
        return activeTemplate.name;
      }
    }
    return "الاستمارة الأساسية";
  },

  getExams: (): Exam[] => {
    if (!isInitialized) {
      const data = localStorage.getItem(STORAGE_KEYS.EXAMS);
      return data ? JSON.parse(data) : examsCache;
    }
    return examsCache;
  },

  saveExam: async (exam: Exam) => {
    const exams = [...storage.getExams()];
    const index = exams.findIndex((e) => e.id === exam.id);
    if (index > -1) {
      exams[index] = exam;
    } else {
      exams.push(exam);
    }
    examsCache = exams;
    await set(STORAGE_KEYS.EXAMS, exams);
    localStorage.removeItem(STORAGE_KEYS.EXAMS);
  },

  saveExams: async (exams: Exam[]) => {
    examsCache = exams;
    await set(STORAGE_KEYS.EXAMS, exams);
    localStorage.removeItem(STORAGE_KEYS.EXAMS);
  },

  getSubmissions: (): ExamSubmission[] => {
    if (!isInitialized) {
      const data = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
      return data ? JSON.parse(data) : submissionsCache;
    }
    return submissionsCache;
  },

  saveSubmission: async (sub: ExamSubmission) => {
    const subs = [...storage.getSubmissions()];
    const index = subs.findIndex((s) => s.id === sub.id);
    if (index > -1) {
      subs[index] = sub;
    } else {
      subs.push(sub);
    }
    submissionsCache = subs;
    await set(STORAGE_KEYS.SUBMISSIONS, subs);
    localStorage.removeItem(STORAGE_KEYS.SUBMISSIONS);
  },

  deleteExam: async (id: string) => {
    const exams = storage.getExams().filter(e => e.id !== id);
    examsCache = exams;
    await set(STORAGE_KEYS.EXAMS, exams);
    localStorage.removeItem(STORAGE_KEYS.EXAMS);
  },

  getResultsSheets: async (): Promise<Record<string, ExamResultRow[]>> => {
    await storage.init();
    const data = await get<Record<string, ExamResultRow[]>>('admission_results_sheets');
    return data || {};
  },

  saveResultsSheets: async (sheets: Record<string, ExamResultRow[]>) => {
    await set('admission_results_sheets', sheets);
  },

  getResultsSheet: async (examId: string): Promise<ExamResultRow[]> => {
    const sheets = await storage.getResultsSheets();
    return sheets[examId] || [];
  },

  initializeResultsSheet: async (examId: string, examTitle: string) => {
    const sheets = await storage.getResultsSheets();
    if (!sheets[examId]) {
      sheets[examId] = [];
      await storage.saveResultsSheets(sheets);
    }
  },

  addResultRow: async (examId: string, row: ExamResultRow) => {
    const sheets = await storage.getResultsSheets();
    if (!sheets[examId]) {
      sheets[examId] = [];
    }
    const idx = sheets[examId].findIndex(r => r.id === row.id || (r.studentId === row.studentId && r.examId === examId));
    if (idx > -1) {
      sheets[examId][idx] = { ...sheets[examId][idx], ...row };
    } else {
      sheets[examId].push(row);
    }
    await storage.saveResultsSheets(sheets);
  },
};

