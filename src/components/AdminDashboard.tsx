/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ChangeEvent } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { storage } from "../lib/storage";
import { getApiUrl } from "../lib/api";
import { StudentApplication, SystemSettings, FormField } from "../types";
import { Settings, Users, ClipboardCheck, Trash2, Plus, Edit2, Shield, Calendar as CalendarIcon, Save, Activity, Globe, Lock, Copy, Check, FileText, Edit3, CloudLightning, RefreshCw, CheckCircle2, LogOut, Terminal, Play, AlertCircle, ExternalLink } from "lucide-react";
import { FormTemplate } from "../types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "./ui/dialog";
import { 
  googleSignIn, 
  logout, 
  initAuth 
} from "../lib/googleAuth";
import { 
  extractFolderIdFromUrl 
} from "../lib/googleDriveSheets";

const DEFAULT_FIELDS: FormField[] = [
  { id: 'fullName', label: 'الاسم رباعي', type: 'text', required: true, system: true },
  { id: 'province', label: 'المحافظة', type: 'text', required: true, system: true },
  { id: 'dob', label: 'تاريخ الميلاد', type: 'date', required: true, system: true },
  { id: 'nationalId', label: 'الرقم القومي', type: 'text', required: true, system: true },
  { id: 'score', label: 'المجموع', type: 'number', required: true, system: true },
  { id: 'fatherName', label: 'اسم ولي الأمر', type: 'text', required: true, system: true },
  { id: 'fatherJob', label: 'عمل ولي الأمر', type: 'text', required: true, system: true },
  { id: 'motherName', label: 'اسم الام', type: 'text', required: true, system: true },
  { id: 'motherJob', label: 'عمل الام', type: 'text', required: true, system: true },
  { id: 'phone', label: 'رقم الموبايل', type: 'text', required: true, system: true },
];

export default function AdminDashboard({ initialTab = "settings" }: { initialTab?: "settings" | "users" | "tools" }) {
  const [settings, setSettings] = useState<SystemSettings>(storage.getSettings());
  const [apps, setApps] = useState<StudentApplication[]>(storage.getApplications());
  
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sheetsInfo, setSheetsInfo] = useState<any>(null);

  // Connection testing states
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string>("");
  const [isBackendSyncing, setIsBackendSyncing] = useState(false);

  // Sync logs states
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [isSyncLogsLoading, setIsSyncLogsLoading] = useState(false);

  const fetchSyncLogs = async () => {
    try {
      setIsSyncLogsLoading(true);
      const res = await fetch(getApiUrl("/api/sync-logs"));
      const data = await res.json();
      setSyncLogs(data);
    } catch (err) {
      console.error("Failed to load sync logs:", err);
    } finally {
      setIsSyncLogsLoading(false);
    }
  };

  // Simulation States
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);

  const handleStartSimulation = async () => {
    try {
      setIsSimulating(true);
      setSimulationResult(null);
      setSimulationLogs(["[جاري التحضير] بدء جلسة المحاكاة واستدعاء خادم الويب..."]);
      
      const res = await fetch(getApiUrl("/api/simulate-submission"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleToken })
      });
      const data = await res.json();
      
      if (data.logs) {
        setSimulationLogs(data.logs);
      }
      
      if (data.success) {
        setSimulationResult({
          regNum: data.regNum,
          fullName: data.fullName,
          driveFolderUrl: data.driveFolderUrl,
          sheetUrl: data.sheetUrl,
          uploadedFiles: data.uploadedFiles
        });
        toast.success(`تمت محاكاة تسجيل الطالب ${data.fullName} ومزامنته بالكامل!`);
        
        // Refresh local applications list
        storage.init(true).then(() => {
          setApps(storage.getApplications());
        }).catch(console.error);
      } else {
        toast.error(`فشلت محاكاة المزامنة: ${data.error || "خطأ مجهول"}`);
      }
    } catch (err: any) {
      setSimulationLogs(prev => [...prev, `[❌ خطأ اتصال] تعذر التواصل مع خادم الويب: ${err.message}`]);
      toast.error("فشل الاتصال بخادم المحاكاة.");
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    fetch(getApiUrl("/api/sheets-info"))
      .then(res => res.json())
      .then(data => {
        if (data.hasCredentials) {
          setSheetsInfo(data);
        }
      })
      .catch(console.error);

    fetchSyncLogs();
    const interval = setInterval(fetchSyncLogs, 10000); // refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (googleToken) {
      // 1. Share token with server for real-time guest registrations
      fetch(getApiUrl("/api/save-google-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: googleToken })
      }).catch(err => console.error("Failed to share token with server:", err));

      // 2. Perform background auto-sync for any offline/unsynced submissions
      fetch(getApiUrl("/api/sync-all"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleToken })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.successCount > 0) {
          toast.success(`تمت مزامنة ${data.successCount} طلبات معلقة تلقائياً وسحابياً!`);
        }
        // Always force load latest submissions from server database & update UI state
        storage.init(true).then(() => {
          setApps(storage.getApplications());
        }).catch(console.error);
      })
      .catch(err => console.error("Auto background sync failed:", err));
    }
  }, [googleToken]);

  const handleExportData = () => {
    try {
      setIsExporting(true);
      const data = {
        settings: storage.getSettings(),
        applications: storage.getApplications(),
        exams: storage.getExams(),
        timestamp: new Date().toISOString(),
        version: "1.0"
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `admission_system_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("تم تصدير نسخة احتياطية من جميع إعدادات وبيانات النظام بنجاح.");
    } catch (err) {
      console.error(err);
      toast.error("فشل تصدير البيانات.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (!data.settings || !data.applications) {
          throw new Error("ملف غير صالح");
        }

        if (confirm("تحذير: سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في الملف. هل أنت متأكد من الاستمرار؟")) {
          storage.saveSettings(data.settings);
          storage.saveApplications(data.applications);
          if (data.exams) storage.saveExams(data.exams);
          
          setSettings(data.settings);
          setApps(data.applications);
          
          toast.success("تم استيراد البيانات بنجاح! جاري تحديث الصفحة...");
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch (err) {
        toast.error("فشل استيراد الملف. تأكد من أنه ملف نسخة احتياطية صحيح.");
      }
    };
    reader.readAsText(file);
  };

  const handleManualSync = async () => {
    if (!googleToken || !settings.spreadsheetId) {
      toast.error("يرجى الربط بحساب جوجل وتحديد ملف الشيتس أولاً.");
      return;
    }

    try {
      setIsSyncing(true);
      toast.info("جاري بدء المزامنة اليدوية الشاملة...");
      
      // We'll use the existing appendRow logic but we need to know the headers first
      // In a real scenario, we might want to check for duplicates or clear the sheet
      // For this implementation, we will append all current applications that aren't marked as synced
      // Or just try to append everything and let the user handle duplicates in Sheets
      
      const { appendSpreadsheetRow } = await import("../lib/googleDriveSheets");
      
      let syncCount = 0;
      for (const app of apps) {
        // Prepare row data based on fields
        const rowData = [
          app.id,
          app.status,
          app.fullName,
          app.nationalId,
          app.phone,
          app.submissionDate,
          ...Object.values(app.customFields || {})
        ];
        
        await appendSpreadsheetRow(googleToken, settings.spreadsheetId, rowData);
        syncCount++;
      }
      
      toast.success(`تمت المزامنة بنجاح! تم إرسال ${syncCount} طلباً إلى Google Sheets.`);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'UNAUTHENTICATED') {
        setGoogleToken(null);
        setGoogleUser(null);
        toast.error("انتهت صلاحية جلسة Google. يرجى إعادة ربط الحساب من تبويب الإعدادات العامة.");
      } else {
        toast.error(`فشل المزامنة: ${err.message || "خطأ غير معروف"}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestBackendConnection = async () => {
    try {
      setTestStatus("testing");
      setTestMessage("جاري فحص صلاحيات حساب الخدمة الخلفي ومطابقة الروابط...");
      const res = await fetch(getApiUrl("/api/google-test-connection"));
      const data = await res.json();
      setTestStatus(data.status);
      setTestMessage(data.message || "");
      if (data.status === "success") {
        toast.success("تم الاتصال السحابي الخلفي بنجاح تام!");
      } else {
        toast.error("تنبيه: الصلاحيات الخلفية تحتاج لضبط.");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMessage(err.message || "فشل الاتصال بخادم الموقع.");
      toast.error("حدث خطأ أثناء الاتصال بالخادم.");
    }
  };

  const handleBackendSyncAll = async () => {
    try {
      setIsBackendSyncing(true);
      toast.info("جاري فحص جميع الطلبات ورفع الملفات وبدء المزامنة السحابية الخلفية...");
      const res = await fetch(getApiUrl("/api/sync-all"), { 
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ googleToken })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`تمت المزامنة الخلفية الشاملة! تم رفع وتحديث ${data.successCount} من أصل ${data.total} طلبات بنجاح في الشيتس.`);
        if (data.failCount > 0) {
          toast.warning(`تنبيه: فشلت مزامنة ${data.failCount} طلبات. يرجى مراجعة إعدادات الصلاحيات ومجلد الحفظ.`);
        }
      } else {
        toast.error(`فشلت المزامنة: ${data.error || "خطأ داخلي"}`);
      }
    } catch (err: any) {
      toast.error(`فشلت العملية السحابية: ${err.message || "خطأ غير متوقع"}`);
    } finally {
      setIsBackendSyncing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        toast.success("تم الاتصال بحساب جوجل وبدء تفعيل خدمات درايف وشيتس بنجاح!");
      }
    } catch (err: any) {
      console.error("Google login failed:", err);
      toast.error("فشل تسجيل الدخول بحساب جوجل. يرجى إعادة المحاولة.");
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setGoogleUser(null);
    setGoogleToken(null);
    toast.info("تم تسجيل خروجك من حساب جوجل للمزامنة.");
  };

  const handleSaveGoogleFolder = (url: string) => {
    const folderId = extractFolderIdFromUrl(url);
    if (!url.trim()) {
      setSettings(prev => ({
        ...prev,
        googleDriveFolderUrl: "",
        googleDriveFolderId: ""
      }));
      toast.info("تمت إزالة رابط مجلد التخزين الرئيسي بجوجل درايف.");
      return;
    }

    setSettings(prev => ({
      ...prev,
      googleDriveFolderUrl: url,
      googleDriveFolderId: folderId
    }));
    toast.success("تم تجديد وحفظ رابط مجلد Google Drive للموقع ككل بنجاح!");
  };
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  const [newField, setNewField] = useState<Partial<FormField>>({ label: '', type: 'text', required: true });
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldOptionsText, setFieldOptionsText] = useState("");

  const [activeTab, setActiveTab] = useState<"settings" | "users" | "tools">(initialTab);

  useEffect(() => {
    setActiveTab(initialTab as any);
  }, [initialTab]);

  // Targets selected template for custom builder
  const [selectedTemplateIdForFields, setSelectedTemplateIdForFields] = useState<string>(
    settings.activeFormTemplateId || 'default-form'
  );

  // Template Creation & Rename Dialog States
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateDialogType, setTemplateDialogType] = useState<'CREATE' | 'RENAME'>('CREATE');
  const [templateDialogName, setTemplateDialogName] = useState("");
  const [targetTemplateId, setTargetTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const persistSettings = async () => {
      await storage.saveSettings(settings);
    };
    persistSettings();
  }, [settings]);

  // Handle Form Template activation
  const handleActivateTemplate = (id: string) => {
    setSettings(prev => ({
      ...prev,
      activeFormTemplateId: id
    }));
    toast.success("تم تفعيل ونشر الاستمارة المحددة للطلاب لتظهر عند التسجيل");
  };

  // Handle duplicate template structure
  const handleDuplicateTemplate = (id: string) => {
    const templateToClone = settings.formTemplates?.find(t => t.id === id);
    if (!templateToClone) return;

    const cloned: FormTemplate = {
      id: crypto.randomUUID(),
      name: `${templateToClone.name} - نسخة كربونية`,
      formFields: templateToClone.formFields.map(f => ({
        ...f,
        id: f.system ? f.id : crypto.randomUUID()
      })),
      createdAt: new Date().toISOString()
    };

    setSettings(prev => ({
      ...prev,
      formTemplates: [...(prev.formTemplates || []), cloned]
    }));
    toast.success(`تم إنشاء نسخة جديدة باسم "${cloned.name}"`);
  };

  // Handle delete visual template
  const handleDeleteTemplate = (id: string) => {
    if (id === settings.activeFormTemplateId) {
      toast.error("عذراً، لا يمكن حذف الاستمارة النشطة حالياً. يرجى تفعيل نموذج آخر أولاً.");
      return;
    }
    if ((settings.formTemplates || []).length <= 1) {
      toast.error("عذراً، يجب الإبقاء على استمارة واحدة على الأقل في النظام.");
      return;
    }

    setSettings(prev => ({
      ...prev,
      formTemplates: (prev.formTemplates || []).filter(t => t.id !== id)
    }));
    toast.info("تم حذف نموذج الاستمارة");
  };

  // Handle saving of Template Creation / Renaming
  const handleSaveTemplateAction = () => {
    if (!templateDialogName.trim()) {
      toast.error("يرجى كتابة اسم الاستمارة أولاً");
      return;
    }

    if (templateDialogType === 'CREATE') {
      const newTemplate: FormTemplate = {
        id: crypto.randomUUID(),
        name: templateDialogName,
        formFields: [...DEFAULT_FIELDS],
        createdAt: new Date().toISOString()
      };
      setSettings(prev => ({
        ...prev,
        formTemplates: [...(prev.formTemplates || []), newTemplate]
      }));
      setSelectedTemplateIdForFields(newTemplate.id);
      toast.success("تم إنشاء الاستمارة بنجاح، يمكنك الآن تعديل حقولها المخصصة أدناه");
    } else if (templateDialogType === 'RENAME' && targetTemplateId) {
      setSettings(prev => ({
        ...prev,
        formTemplates: (prev.formTemplates || []).map(t => t.id === targetTemplateId ? { ...t, name: templateDialogName } : t)
      }));
      toast.success("تم تعديل الاسم بنجاح");
    }

    setIsTemplateDialogOpen(false);
    setTemplateDialogName("");
    setTargetTemplateId(null);
  };

  const handleSaveField = () => {
    if (!newField.label) {
      toast.error("يرجى إدخال اسم الحقل");
      return;
    }
    
    const parsedOptions = fieldOptionsText
      ? fieldOptionsText.split(",").map(opt => opt.trim()).filter(Boolean)
      : undefined;

    setSettings(prev => {
      const templates = prev.formTemplates || [];
      const updatedTemplates = templates.map(t => {
        if (t.id === selectedTemplateIdForFields) {
          let updatedFields = t.formFields;
          if (editingFieldId) {
            // Edit Mode
            updatedFields = t.formFields.map(f => f.id === editingFieldId ? {
              ...f,
              label: newField.label!,
              type: newField.type as any,
              required: !!newField.required,
              hidden: !!newField.hidden,
              options: parsedOptions,
            } : f);
          } else {
            // Add Mode
            const field: FormField = {
              id: crypto.randomUUID(),
              label: newField.label || "",
              type: newField.type as any,
              required: !!newField.required,
              hidden: !!newField.hidden,
              options: parsedOptions,
            };
            updatedFields = [...t.formFields, field];
          }
          return { ...t, formFields: updatedFields };
        }
        return t;
      });

      const activeT = updatedTemplates.find(x => x.id === prev.activeFormTemplateId);
      return {
        ...prev,
        formTemplates: updatedTemplates,
        formFields: activeT ? activeT.formFields : prev.formFields
      };
    });

    toast.success(editingFieldId ? "تم تعديل الحقل بنجاح" : "تم إضافة الحقل بنجاح");
    setNewField({ label: '', type: 'text', required: true, hidden: false });
    setFieldOptionsText("");
    setEditingFieldId(null);
    setIsFieldDialogOpen(false);
  };

  const startAddField = () => {
    setNewField({ label: '', type: 'text', required: true, hidden: false });
    setFieldOptionsText("");
    setEditingFieldId(null);
    setIsFieldDialogOpen(true);
  };

  const startEditField = (field: FormField) => {
    setNewField({ label: field.label, type: field.type, required: field.required, hidden: !!field.hidden });
    setFieldOptionsText(field.options ? field.options.join(", ") : "");
    setEditingFieldId(field.id);
    setIsFieldDialogOpen(true);
  };

  const removeField = (id: string) => {
    setSettings(prev => {
      const templates = prev.formTemplates || [];
      const updatedTemplates = templates.map(t => {
        if (t.id === selectedTemplateIdForFields) {
          return {
            ...t,
            formFields: t.formFields.filter(f => f.id !== id || f.system)
          };
        }
        return t;
      });
      const activeT = updatedTemplates.find(x => x.id === prev.activeFormTemplateId);
      return {
        ...prev,
        formTemplates: updatedTemplates,
        formFields: activeT ? activeT.formFields : prev.formFields
      };
    });
    toast.info("تم حذف الحقل من هذا النموذج بنجاح");
  };

  const selectedTemplate = (settings.formTemplates || []).find(t => t.id === selectedTemplateIdForFields) 
    || (settings.formTemplates && settings.formTemplates[0])
    || { id: 'default-form', name: 'الاستمارة الأساسية', formFields: settings.formFields || DEFAULT_FIELDS };
  
  const currentFieldsForSelectedTemplate = selectedTemplate.formFields || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tighter">لوحة تحكم المدير</h1>
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="text-xs font-bold text-slate-500">
           العودة للرئيسية &rarr;
        </Button>
      </div>
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="إجمالي المتقدمين" value={apps.length} icon={<Users size={16}/>} trend="+١٢٪ من الأسبوع الماضي" />
        <StatCard title="قيد المراجعة" value={apps.filter(a => a.status === 'PENDING').length} icon={<Activity size={16}/>} />
        <StatCard title="تم قبولهم" value={apps.filter(a => a.status === 'APPROVED').length} icon={<ClipboardCheck size={16}/>} />
        <StatCard title="نسبة القبول" value={`${apps.length ? Math.round((apps.filter(a => a.status === 'APPROVED').length / apps.length) * 100) : 0}%`} icon={<Activity size={16}/>} />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="bg-slate-200/50 p-1 border border-slate-200">
            <TabsTrigger value="settings" className="text-xs py-1.5 px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">إعدادات عامة</TabsTrigger>
            <TabsTrigger value="users" className="text-xs py-1.5 px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">فريق العمل</TabsTrigger>
            <TabsTrigger value="tools" className="text-xs py-1.5 px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">أدوات متقدمة</TabsTrigger>
          </TabsList>
          
          <div className="text-[10px] text-slate-400 font-mono tracking-widest hidden sm:block uppercase">ADMIN_CONSOLE // DB_SESSION_ACTIVE</div>
        </div>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="high-density-card">
              <CardHeader className="py-4 border-b border-slate-100">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Globe size={14} className="text-blue-500" /> التحكم في الوصول
                </CardTitle>
                <CardDescription className="text-[10px]">تعديل الحالات العامة لبوابة القبول</CardDescription>
              </CardHeader>
              <CardContent className="py-4 space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold">بوابة التسجيل</p>
                    <p className="text-[10px] text-slate-500">فتح أو إغلاق استقبال الطلبات الجديدة</p>
                  </div>
                  <Switch 
                    checked={settings.registrationOpen} 
                    onCheckedChange={(checked) => setSettings({...settings, registrationOpen: checked})} 
                  />
                </div>
                
                <div className="space-y-2">
                   <Label className="text-xs font-bold flex items-center gap-2 px-1">
                      <CalendarIcon size={12} className="text-slate-400" /> موعد الإغلاق التلقائي
                   </Label>
                   <Input 
                      type="date" 
                      className="text-xs h-9 bg-white border-slate-200 focus:ring-1 focus:ring-blue-500"
                      value={settings.registrationDeadline || ''} 
                      onChange={(e) => setSettings({...settings, registrationDeadline: e.target.value})}
                   />
                </div>
                
                <Button size="sm" className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700 h-9">
                   <Save size={14} className="ml-2" /> تحديث البيانات العامة
                </Button>
              </CardContent>
            </Card>

            <Card className="high-density-card">
              <CardHeader className="py-4 border-b border-slate-100">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Lock size={14} className="text-amber-500" /> الحماية والأمان
                </CardTitle>
                <CardDescription className="text-[10px]">تعديل معايير التحقق والوصول</CardDescription>
              </CardHeader>
              <CardContent className="py-4 space-y-4">
                <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
                   <div className="space-y-0.5">
                      <p className="text-xs font-bold">التحقق من رقم الهوية</p>
                      <p className="text-[10px] text-slate-500">منع التكرار والتحقق من النمط</p>
                   </div>
                   <Switch checked defaultChecked />
                </div>
                <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
                   <div className="space-y-0.5">
                      <p className="text-xs font-bold">رفع المستندات إلزامي</p>
                      <p className="text-[10px] text-slate-500">منع الحفظ بدون جميع الملحقات</p>
                   </div>
                   <Switch checked defaultChecked />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Google Drive & Google sheets Integration settings card */}
          <Card className="col-span-1 md:col-span-2 shadow-sm border border-slate-200 rounded-xl overflow-hidden mt-4">
            <CardHeader className="py-4 border-b border-slate-100 bg-slate-50/40">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <CloudLightning size={16} className="text-emerald-500" /> إعدادات الربط والنسخ الاحتياطي التلقائي (Google Workspace)
              </CardTitle>
              <CardDescription className="text-[10px]">ربط نظام التسجيل بجوجل درايف وحفظ البيانات بملفات جوجل شيتس.</CardDescription>
            </CardHeader>
            <CardContent className="py-5 space-y-6">
              
              {/* Auth section */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 border border-slate-200/60 rounded-xl gap-4">
                <div className="space-y-1 text-right">
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    حساب Google لنظام القبول
                    {googleUser && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {googleUser 
                      ? `متصل ومصرح بالكامل: ${googleUser.email}` 
                      : "يتطلب الاتصال بحساب Google وتوفير الصلاحيات اللازمة لإنشاء المجلدات والمستندات بـ Google Drive."
                    }
                  </p>
                </div>
                <div>
                  {googleUser ? (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={handleGoogleSignOut} 
                      className="text-[10px] h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-100 font-bold"
                    >
                      قطع الاتصال بالحساب
                    </Button>
                  ) : (
                    <Button 
                      type="button" 
                      onClick={handleGoogleSignIn} 
                      size="sm" 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold h-8 flex items-center gap-1 shadow-sm"
                    >
                      <CloudLightning size={12} /> ربط حساب Google
                    </Button>
                  )}
                </div>
              </div>

              {/* Directory link input section */}
              <div className="space-y-2">
                <Label className="text-xs font-black text-slate-700 flex items-center gap-1 px-0.5">
                  رابط مجلد التخزين الرئيسي بجوجل درايف (Google Drive Saving Folder Link)
                </Label>
                <div className="flex gap-2">
                  <Input 
                    type="url" 
                    placeholder="أدخل رابط مجلد جوجل درايف الرئيسي، مثال: https://drive.google.com/drive/folders/..." 
                    className="text-xs h-10 bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500 flex-1 text-left"
                    dir="ltr"
                    defaultValue={settings.googleDriveFolderUrl || ''}
                    id="googleDriveFolderInput"
                  />
                  <Button 
                    type="button" 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-10 px-5 font-bold shrink-0 shadow-sm"
                    onClick={() => {
                      const inputEl = document.getElementById('googleDriveFolderInput') as HTMLInputElement;
                      if (inputEl) {
                        handleSaveGoogleFolder(inputEl.value);
                      }
                    }}
                  >
                    <Save size={13} className="ml-1" /> حفظ وتثبيت
                  </Button>
                </div>
                {settings.googleDriveFolderId && (
                  <p className="text-[10px] text-emerald-600 font-mono font-medium leading-relaxed bg-emerald-50/50 border border-emerald-100/50 p-2.5 rounded-lg flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    تم تفعيل والتحقق من معرف مسار الحفظ النشط: <strong>{settings.googleDriveFolderId}</strong>
                  </p>
                )}
              </div>

              {/* Spreadsheet ID section */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <Label className="text-xs font-black text-slate-700 flex items-center gap-1 px-0.5">
                  معرف ملف Google Sheets للمزامنة التلقائية (Spreadsheet ID)
                </Label>
                <div className="flex gap-2">
                  <Input 
                    type="text" 
                    placeholder="أدخل معرف الملف (ID) الموجود في رابط الشيتس" 
                    className="text-xs h-10 bg-white border-slate-200 focus:ring-2 focus:ring-emerald-500 flex-1 text-left"
                    dir="ltr"
                    value={settings.spreadsheetId || ''}
                    onChange={(e) => setSettings(prev => ({ ...prev, spreadsheetId: e.target.value }))}
                  />
                  <Button 
                    type="button" 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-10 px-5 font-bold shrink-0 shadow-sm"
                    onClick={() => {
                       storage.saveSettings(settings);
                       toast.success("تم حفظ معرف ورقة البيانات بنجاح!");
                     }}
                  >
                    <Save size={13} className="ml-1" /> حفظ المعرف
                  </Button>
                </div>
                <p className="text-[9px] text-slate-400">
                  يمكن العثور على المعرف في رابط الملف بين d/ و /edit. مثال: .../d/<strong>1abc-def...</strong>/edit
                </p>

                {sheetsInfo?.clientEmail && (
                  <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-2 text-right mt-3 text-amber-900 animate-in fade-in">
                    <p className="text-xs font-black flex items-center gap-1.5 text-amber-950">
                      💡 هام جداً للمزامنة السحابية الخلفية:
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      يجب مشاركة ملف Google Sheet الخاص بك مع البريد الإلكتروني أدناه كـ <strong>محرر (Editor)</strong>.
                      المزامنة التلقائية الخلفية تستخدم حساب الخدمة لتحديث البيانات، وإذا لم تشاركه، ستظهر مشكلة في الصلاحيات:
                    </p>
                    <div className="flex items-center gap-2 bg-white border border-amber-200 p-2 rounded text-left font-mono text-[11px] select-all justify-between text-slate-700">
                      <span className="truncate flex-1 select-all">{sheetsInfo.clientEmail}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs text-amber-900 border-amber-200 hover:bg-amber-100 bg-amber-50 shrink-0 font-bold"
                        onClick={() => {
                          navigator.clipboard.writeText(sheetsInfo.clientEmail);
                          toast.success("تم نسخ بريد الخدمة السحابية!");
                        }}
                      >
                        نسخ البريد
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
           <UserManagement googleToken={googleToken} />
        </TabsContent>

        <TabsContent value="tools" className="space-y-6">
          {/* لوحة ربط نظام القبول بـ Google Workspace - Unified & Explained Connection Hub */}
          <Card className="border-emerald-200 shadow-md bg-white overflow-hidden text-right" dir="rtl">
            <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-5 border-b border-emerald-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${googleUser ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <CloudLightning size={24} className={googleUser ? "animate-pulse" : ""} />
                </div>
                <div className="text-right">
                  <h3 className="text-xs font-black text-slate-950 flex items-center gap-2">
                    لوحة ربط نظام القبول بـ Google Workspace
                    {googleUser && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1 font-semibold leading-relaxed">
                    {googleUser 
                      ? `متصل بنجاح، الحساب النشط للمزامنة: ${googleUser.email}` 
                      : "يرجى تسجيل الدخول بحساب Google المعتمد لتلقي الاستجابات تلقائياً على Google Sheets وحفظ الوثائق على Google Drive."
                    }
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                {googleUser ? (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={async () => {
                      await logout();
                      setGoogleUser(null);
                      setGoogleToken(null);
                      toast.success("تم الخروج من حساب جوجل الشخصي.");
                    }} 
                    className="text-[10px] h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-250 font-black px-4"
                  >
                    <LogOut size={12} className="ml-1" /> قطع الاتصال بـ Google
                  </Button>
                ) : (
                  <Button 
                    type="button" 
                    onClick={handleGoogleSignIn} 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black h-8 flex items-center gap-1 shadow-sm px-4"
                  >
                    <CloudLightning size={12} /> ربط حساب Google
                  </Button>
                )}
              </div>
            </div>

            {/* Explanation panel about 24/7 Service Account vs Admin Temporary Token */}
            <div className="bg-slate-50/50 p-4 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                
                <div className="p-3.5 bg-white border border-slate-150 rounded-xl space-y-1.5 shadow-sm">
                  <h4 className="text-[11px] font-extrabold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    الخيار الأول: المزامنة التلقائية 24/7 (حساب الخدمة الموصى به)
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                    <strong>تعمل بشكل مستمر وتلقائي بالخلفية حتى أثناء غياب المشرف!</strong> هذه هي الطريقة الأضمن لمعالجة استمارات الزوار الجدد في أي وقت. تعتمد بالكامل على تفعيل بريد الروبوت <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">GOOGLE_APPLICATION_CREDENTIALS_JSON</code> على السيرفر.
                  </p>
                  <p className="text-[9.5px] text-emerald-800 font-bold bg-emerald-50/60 p-2 rounded border border-emerald-100/40">
                    💡 شريطة مشاركة ورقة Google Sheets ومجلد Google Drive مع البريد الإلكتروني الخاص بحساب الخدمة كـ (Editor / محرر) لمنع مشاكل الصلاحيات.
                  </p>
                </div>

                <div className="p-3.5 bg-white border border-slate-150 rounded-xl space-y-1.5 shadow-sm">
                  <h4 className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5">
                    <Shield size={13} className="text-slate-500 shrink-0" />
                    الخيار الثاني: جلسة المشرف المؤقتة (تسجيل الدخول لجوجل أعلاه)
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                    <strong>تستخدم للفحص اليدوي السريع والمزامنة من داخل لوحة التحكم.</strong> ينتهي هذا التصريح تلقائياً من جوجل بعد مرور 50 دقيقة لدواعي الأمان والسرية؛ ولذلك لا يمكن الاعتماد عليه للمزامنة الآلية دون تواجد المشرف.
                  </p>
                  <p className="text-[9.5px] text-slate-400 font-bold bg-slate-100/80 p-2 rounded border border-slate-200">
                    ⚠️ تظهر أهميتها كبديل مباشر وسهل إذا لم ترغب بتهيئة حساب الخدمة العام وترغب بعمل مزامنة بنقرة واحدة من متصفحك.
                  </p>
                </div>

              </div>
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="high-density-card border-indigo-100 shadow-md">
              <CardHeader className="py-5 border-b border-indigo-50 bg-indigo-50/30">
                <CardTitle className="text-sm font-black flex items-center gap-2 text-indigo-900">
                  <Save size={16} /> النسخ الاحتياطي واستعادة البيانات
                </CardTitle>
                <CardDescription className="text-[10px] text-indigo-600/70 font-bold">حفظ إعدادات النظام، حقول الاستمارة، وبيانات الطلاب في ملف خارجي للاحتفاظ به أو نقله.</CardDescription>
              </CardHeader>
              <CardContent className="py-6 space-y-5">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-black text-slate-800">تصدير بيانات النظام (Backup)</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">سيتم إنشاء ملف JSON يحتوي على كافة الإعدادات الحالية، نماذج الاستمارات، وقاعدة بيانات الطلاب المسجلة محلياً.</p>
                  <Button 
                    variant="outline" 
                    className="w-full h-10 border-indigo-200 text-indigo-700 font-bold hover:bg-indigo-50 text-xs"
                    onClick={handleExportData}
                    disabled={isExporting}
                  >
                    {isExporting ? <RefreshCw size={14} className="ml-2 animate-spin" /> : <CloudLightning size={14} className="ml-2" />}
                    تصدير ملف النسخة الاحتياطية الآن
                  </Button>
                </div>

                <div className="p-4 border border-dashed border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-black text-slate-800">استرداد بيانات من ملف (Restore)</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">اختر ملف النسخة الاحتياطية لاستعادة كافة البيانات. <span className="text-rose-600 font-bold">تنبيه: سيؤدي هذا لمسح البيانات الحالية واستبدالها.</span></p>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".json" 
                      onChange={handleImportData}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button 
                      variant="ghost" 
                      className="w-full h-10 border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 text-xs"
                    >
                      <Plus size={14} className="ml-2" /> اختيار ملف الاستعادة (.json)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* Card 1: Backend service account dashboard (Recommended) */}
              <Card className="high-density-card border-emerald-100 shadow-md">
                <CardHeader className="py-5 border-b border-emerald-50 bg-emerald-50/30">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-emerald-900">
                      <Activity className="text-emerald-600" size={16} /> الاتصال السحابي الخلفي المستمر (حساب الخدمة)
                    </CardTitle>
                    <Badge className="bg-emerald-100 text-emerald-800 text-[9px] hover:bg-emerald-100">تلقائي ومستمر 24/7</Badge>
                  </div>
                  <CardDescription className="text-[10px] text-emerald-700/70 font-bold">
                    إدارة ومتابعة المزامنة التلقائية لبيانات وملفات المتقدمين فور تسجيلهم، دون الحاجة لفتح المتصفح أو تسجيل الدخول يدويًا.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-6 space-y-5">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-500">حالة الربط المباشر للسيرفر:</span>
                      {testStatus === "success" ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-6 text-[10px]">جاهز ومتصل</Badge>
                      ) : testStatus === "permission_denied" ? (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-6 text-[10px]">فشل الصلاحيات (إجراء مطلوب)</Badge>
                      ) : testStatus === "testing" ? (
                        <Badge className="bg-blue-500 text-white font-bold h-6 text-[10px] animate-pulse">جاري الفحص...</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-slate-200 text-slate-500 font-bold h-6 text-[10px]">غير مفحوص</Badge>
                      )}
                    </div>

                    {/* Diagnostic feedback area */}
                    {testStatus && (
                      <div className={`p-3 rounded-lg text-xs leading-relaxed ${
                        testStatus === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" :
                        testStatus === "permission_denied" ? "bg-amber-50 text-amber-900 border border-amber-300" :
                        testStatus === "testing" ? "bg-blue-50 text-blue-800 border border-blue-200" :
                        "bg-rose-50 text-rose-900 border border-rose-200"
                      }`}>
                        <div className="font-bold flex items-center gap-1.5 mb-1.5">
                          {testStatus === "success" && <CheckCircle2 size={14} className="text-emerald-600" />}
                          {testStatus === "testing" && <RefreshCw size={14} className="animate-spin text-blue-600" />}
                          مخرجات الفحص الفني:
                        </div>
                        <p className="text-[11px] font-medium">{testMessage}</p>

                        {testStatus === "permission_denied" && sheetsInfo?.clientEmail && (
                          <div className="mt-3 pt-2 border-t border-amber-200/60 space-y-2">
                            <p className="text-[11px] font-bold text-amber-950">
                              🗝️ لحل مشكلة الصلاحيات (Permission Denied):
                            </p>
                            <ol className="list-decimal list-inside text-[10.5px] leading-relaxed space-y-1 text-amber-900">
                              <li>افتح ملف Google Sheets الخاص بالتقديم.</li>
                              <li>انقر على زر <strong>مشاركة (Share)</strong> في الأعلى.</li>
                              <li>أضف بريد حساب الخدمة التالي كـ <strong>Editor (محرر)</strong>:</li>
                            </ol>
                            <div className="flex items-center gap-1.5 bg-white border border-amber-300 p-1.5 rounded text-left font-mono text-[10px] select-all justify-between text-slate-700">
                              <span className="truncate flex-1 font-bold select-all">{sheetsInfo.clientEmail}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-amber-950 border-amber-300 hover:bg-amber-100 bg-amber-50 shrink-0 font-bold"
                                onClick={() => {
                                  navigator.clipboard.writeText(sheetsInfo.clientEmail);
                                  toast.success("تم نسخ بريد حساب الخدمة!");
                                }}
                              >
                                نسخ البريد
                              </Button>
                            </div>
                            <p className="text-[10.5px] text-amber-800 font-bold">
                              ⚠️ ملاحظة: إذا كنت ترفع مستندات الطلاب لمجلد Google Drive، تأكد أيضاً من مشاركة مجلد الدرايف مع نفس البريد السحابي كـ Editor!
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="text-xs font-bold border-slate-300"
                        onClick={handleTestBackendConnection}
                        disabled={testStatus === "testing" || isBackendSyncing}
                      >
                        {testStatus === "testing" ? <RefreshCw className="ml-1.5 animate-spin" size={13} /> : <Check className="ml-1.5" size={13} />}
                        اختبار وفحص الاتصال الخلفي
                      </Button>

                      <Button
                        type="button"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow"
                        onClick={handleBackendSyncAll}
                        disabled={isBackendSyncing || testStatus === "testing"}
                      >
                        {isBackendSyncing ? <RefreshCw className="ml-1.5 animate-spin" size={13} /> : <CloudLightning className="ml-1.5" size={13} />}
                        مزامنة وتفريغ كافة الطلبات
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Manual Direct Admin Token Sync (Fallback) */}
              <Card className="high-density-card border-slate-200/80 shadow border-dashed">
                <CardHeader className="py-4 border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-xs font-extrabold flex items-center gap-1.5 text-slate-700">
                    <Lock size={12} fill="currentColor" /> المزامنة المباشرة بحسابك الشخصي (بديل إضافي)
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-bold text-slate-600">طلب تحديث للملفات عبر جلسة المتصفح الخاصة بك:</p>
                      <p className="text-[9px] text-slate-400">مفيد إذا أردت المزامنة المباشرة لحسابك دون إعداد بريد الخدمة.</p>
                    </div>
                    <Badge variant={googleUser ? "default" : "secondary"} className={`text-[9px] h-5 ${googleUser ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {googleUser ? 'حسابك الشخصي مرتبط' : 'غير مرتبط'}
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      className="flex-1 h-9 text-xs font-bold border-slate-200 bg-white hover:bg-slate-50"
                      onClick={handleManualSync}
                      disabled={isSyncing || !googleToken}
                    >
                      {isSyncing ? <RefreshCw size={13} className="ml-1.5 animate-spin" /> : <RefreshCw size={13} className="ml-1.5" />}
                      بدء مزامنة مباشرة بالمتصفح {googleUser ? `باسم (${googleUser.email.split('@')[0]})` : ''}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* سجل المزامنة التلقائية بالخلفية - Live Sync Logs UI */}
          <Card className="mt-6 border-slate-200 shadow-md text-right" dir="rtl">
            <CardHeader className="py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-sm font-black flex items-center gap-2 text-slate-900">
                  <Activity size={16} className="text-indigo-600 animate-pulse" /> سجل المزامنة السحابية للطلاب والزوار بالخلفية (Live Sync Logs)
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-500 font-semibold">
                  تحقق من حالة إرسال استمارات المتقدمين فور تسجيلهم في غياب المشرف وتأكد من وصولها لجدول البيانات ودرايف بنجاح.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSyncLogs}
                disabled={isSyncLogsLoading}
                className="h-8 px-3 text-[10px] font-bold border-slate-200 bg-white shadow-sm flex items-center gap-1.5 hover:bg-slate-50"
              >
                <RefreshCw size={12} className={isSyncLogsLoading ? "animate-spin" : ""} />
                تحديث قائمة العمليات
              </Button>
            </CardHeader>
            <CardContent className="py-5">
              {isSyncLogsLoading && syncLogs.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2.5">
                  <RefreshCw size={24} className="animate-spin text-slate-400" />
                  <p className="text-xs font-bold">جاري تحميل وتحديث سجل العمليات الخلفية...</p>
                </div>
              ) : syncLogs.length === 0 ? (
                <div className="py-10 border border-dashed border-slate-150 rounded-xl flex flex-col items-center justify-center text-center space-y-3 bg-slate-50/50">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <Activity size={18} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-700">لا توجد سجلات مزامنة خلفية حتى الآن</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed max-w-[340px] px-4 font-semibold">
                      تظهر هنا تفاصيل أي عملية تقديم تتم كزائر فور إرسالها. يمكنك استخدام "محاكي تسجيل زائر" في الأسفل لتجربة آلية العمل وفحص السجلات هنا مباشرة.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {syncLogs.map((log: any) => (
                    <div 
                      key={log.id} 
                      className={`border rounded-xl p-4 transition-all duration-200 ${
                        log.status === 'success' 
                          ? 'border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50/40' 
                          : 'border-rose-100 bg-rose-50/10 hover:bg-rose-50/20'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-right">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg text-white ${
                            log.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}>
                            <Activity size={14} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-900">
                              {log.studentName}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-mono font-bold">
                              <span>كود الطالب: {log.regNum}</span>
                              <span className="text-slate-300">•</span>
                              <span>تاريخ المحاولة: {log.timestamp}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2 self-start sm:self-center">
                          {log.status === 'success' ? (
                            <Badge className="bg-emerald-500 text-white hover:bg-emerald-500 h-6 text-[10px] font-bold">مزامنة ناجحة</Badge>
                          ) : (
                            <Badge className="bg-rose-500 text-white hover:bg-rose-500 h-6 text-[10px] font-bold">فشل المزامنة</Badge>
                          )}
                        </div>
                      </div>

                      {log.status === 'failed' && (
                        <div className="mt-3.5 pt-3.5 border-t border-rose-100/60 text-right space-y-2">
                          <p className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                            <AlertCircle size={14} className="text-rose-500 shrink-0" />
                            سبب الفشل: {log.error || "تأخر أو مشكلة في استجابة خادم جوجل"}
                          </p>
                          {log.details && (
                            <p className="text-[10.5px] text-rose-800 leading-relaxed font-semibold bg-rose-50/70 p-3 rounded-lg border border-rose-100/50">
                              {log.details}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Simulation & Diagnostics Dashboard Card */}
          <div className="mt-6">
            <Card className="border-indigo-200 shadow-md">
              <CardHeader className="py-5 border-b border-indigo-100 bg-indigo-50/20">
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-black flex items-center gap-2 text-indigo-950">
                      <Terminal size={16} className="text-indigo-600" /> محاكي تسجيل زائر جديد وتتبع المزامنة السحابية (Visual Admission Simulator)
                    </CardTitle>
                    <CardDescription className="text-[10px] text-slate-500 font-semibold">
                      أداة تشخيص فوري تتيح لك تجربة تقديم طالب وهمي كـ "زائر" ومراقبة دورة الرفع لجوجل درايف والكتابة بالشيتس خطوة بخطوة مع عرض الأخطاء والنجاح.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleStartSimulation}
                    disabled={isSimulating}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-4 gap-1.5 shadow"
                  >
                    {isSimulating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
                    {isSimulating ? "جاري تنفيذ المحاكاة..." : "بدء محاكاة تسجيل زائر"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="py-5 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  
                  {/* Left Column: Log Output Console (Terminal style) */}
                  <div className="lg:col-span-7 flex flex-col space-y-2">
                    <Label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>شاشة مخرجات الفحص التشخيصي (Live Diagnostic Terminal)</span>
                      <span className="text-[9px] font-mono bg-slate-100 text-slate-500 py-0.5 px-2 rounded-full">REALTIME_SHEETS_DRIVE_TRACE</span>
                    </Label>
                    <div className="bg-slate-900 border border-slate-950 p-4 rounded-xl font-mono text-[11px] text-slate-200 h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                      {simulationLogs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 animate-pulse space-y-2">
                          <Terminal size={24} className="text-slate-400" />
                          <p className="text-[10px] text-center">انقر على "بدء محاكاة تسجيل زائر" أعلاه لمراقبة دورة المزامنة السحابية خطوة بخطوة هنا...</p>
                        </div>
                      ) : (
                        simulationLogs.map((log, index) => {
                          let colorClass = "text-slate-300";
                          if (log.includes("✅") || log.includes("🎉")) colorClass = "text-emerald-400 font-semibold";
                          else if (log.includes("❌")) colorClass = "text-rose-400 font-bold";
                          else if (log.includes("⚠️") || log.includes("تنبيه:")) colorClass = "text-amber-400 font-semibold";
                          else if (log.includes("[SIMULATION]") || log.includes("توليد")) colorClass = "text-indigo-300";

                          return (
                            <div key={index} className={`whitespace-pre-wrap leading-relaxed py-0.5 border-b border-slate-800/20 ${colorClass} text-right`} dir="rtl">
                              {log}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Column: Visual Report Results */}
                  <div className="lg:col-span-5 space-y-4 text-right" dir="rtl">
                    <Label className="text-xs font-bold text-slate-700">تقرير النتيجة وروابط الوصول السحابية</Label>
                    
                    {!simulationResult ? (
                      <div className="border border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center h-[calc(100%-1.5rem)] space-y-3 bg-slate-50/50">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                          <AlertCircle size={20} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700">بانتظار انطلاق المحاكي</p>
                          <p className="text-[10px] text-slate-400 leading-relaxed max-w-[200px] mx-auto">
                            عند اكتمال تسجيل الطالب التجريبي، ستظهر هنا روابط ورقة جوجل شيت ومستندات الطالب التي تم رفعها بدرايف.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-indigo-100 bg-indigo-50/20 rounded-xl p-4 space-y-3.5 animate-in zoom-in duration-300">
                        <div className="border-b border-indigo-100/60 pb-2.5">
                          <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1">
                            <CheckCircle2 className="text-emerald-500 shrink-0" size={14} /> تقرير المحاكاة الناجحة:
                          </h4>
                          <p className="text-[10px] text-slate-400 font-medium mt-1">توليد وإرسال تطبيق كامل البيانات محاكياً لتفاعل حقيقي بنسبة 100%.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-right">
                          <div className="bg-white border border-indigo-100/40 p-2.5 rounded-lg">
                            <p className="text-[9px] text-slate-400 font-bold">الطالب التجريبي:</p>
                            <p className="text-xs font-black text-slate-800 truncate mt-0.5">{simulationResult.fullName}</p>
                          </div>
                          <div className="bg-white border border-indigo-100/40 p-2.5 rounded-lg">
                            <p className="text-[9px] text-slate-400 font-bold">رقم التسجيل (كود الطالب):</p>
                            <p className="text-xs font-mono font-bold text-indigo-700 mt-0.5">{simulationResult.regNum}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] font-bold text-slate-500">حساب جوجل وحزم روابط الوصول:</Label>
                          
                          {simulationResult.sheetUrl && (
                            <a 
                              href={simulationResult.sheetUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-2.5 bg-white border border-emerald-200/50 hover:border-emerald-500 text-emerald-950 hover:bg-emerald-50/30 rounded-lg text-xs font-bold transition-all"
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                فتح ورقة المزامنة Google Sheet
                              </span>
                              <ExternalLink size={12} className="text-emerald-600" />
                            </a>
                          )}

                          {simulationResult.driveFolderUrl && (
                            <a 
                              href={simulationResult.driveFolderUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-2.5 bg-white border border-indigo-200/50 hover:border-indigo-500 text-indigo-950 hover:bg-indigo-50/30 rounded-lg text-xs font-bold transition-all"
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                فتح مجلد مستندات الطالب بدرايف
                              </span>
                              <ExternalLink size={12} className="text-indigo-600" />
                            </a>
                          )}
                        </div>

                        {simulationResult.uploadedFiles && (
                          <div className="bg-white/90 border border-indigo-50 p-2.5 rounded-lg space-y-1.5">
                            <p className="text-[9px] font-black text-slate-500">روابط المرفقات السحابية المنشأة بدرايف:</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {Object.entries(simulationResult.uploadedFiles).map(([key, link]: any) => {
                                const labels: any = {
                                  personalPhoto: "الصورة الشخصية",
                                  birthCertificate: "شهادة الميلاد",
                                  prepCertificate: "الشهادة الإعدادية",
                                  parentNationalId: "بطاقة الأب"
                                };
                                return (
                                  <a
                                    key={key}
                                    href={link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="bg-slate-50 hover:bg-slate-100 p-1.5 rounded text-[10px] text-slate-600 flex items-center justify-between truncate border border-slate-100"
                                  >
                                    <span className="truncate">{labels[key] || key}</span>
                                    <ExternalLink size={10} className="text-slate-400 shrink-0 select-none mr-1" />
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserManagement({ googleToken }: { googleToken: string | null }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(getApiUrl('/api/users'))
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        setLoading(false);
      });
  }, []);

  const handleRoleChange = async (userId: string, roles: string[]) => {
    const user = users.find(u => u.uid === userId);
    if (!user) return;
    
    const updated = { ...user, roles };
    try {
      await fetch(getApiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      setUsers(prev => prev.map(u => u.uid === userId ? updated : u));
      toast.success("تم تحديث صلاحيات المستخدم");
    } catch (e) {
      toast.error("فشل تحديث الصلاحيات");
    }
  };

  return (
    <Card className="high-density-card">
      <CardHeader className="py-4 border-b border-slate-100">
        <CardTitle className="text-sm font-black flex items-center gap-2">
          <Shield size={16} className="text-indigo-600" /> إدارة فريق العمل والصلاحيات
        </CardTitle>
        <CardDescription className="text-[10px]">تحديد من يمكنه مراجعة الطلبات أو تصحيح الاختبارات</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="text-right text-[10px] font-bold h-10">المستخدم</TableHead>
              <TableHead className="text-right text-[10px] font-bold h-10">البريد الإلكتروني</TableHead>
              <TableHead className="text-right text-[10px] font-bold h-10">الصلاحيات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-slate-400 text-xs">لا يوجد مستخدمين مسجلين حالياً</TableCell>
              </TableRow>
            ) : (
              users.map(user => (
                <TableRow key={user.uid}>
                  <TableCell className="text-xs font-bold">{user.displayName}</TableCell>
                  <TableCell className="text-xs text-slate-500 font-mono">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                       {['ADMIN', 'REVIEWER', 'GRADER'].map((role) => (
                         <div key={role}>
                           <Badge 
                             variant={user.roles?.includes(role) ? "default" : "outline"}
                             className="cursor-pointer text-[9px] h-5"
                             onClick={() => {
                               const newRoles = user.roles?.includes(role) 
                                 ? user.roles.filter((r: any) => r !== role)
                                 : [...(user.roles || []), role];
                               handleRoleChange(user.uid, newRoles);
                             }}
                           >
                             {role === 'ADMIN' ? 'مدير' : role === 'REVIEWER' ? 'مشرف' : 'مصحح'}
                           </Badge>
                         </div>
                       ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, icon, trend }: any) {
  return (
    <Card className="high-density-card">
       <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
             <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                {icon}
             </div>
             {trend && <span className="text-[10px] text-emerald-600 font-bold">{trend}</span>}
          </div>
          <div className="space-y-0.5">
             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{title}</p>
             <p className="text-xl font-extrabold text-slate-900">{value}</p>
          </div>
       </CardContent>
    </Card>
  );
}
