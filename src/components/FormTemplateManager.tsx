/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { storage } from "../lib/storage";
import { SystemSettings, FormField, FormTemplate } from "../types";
import { 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  FileText, 
  Wrench, 
  Eye, 
  Layers, 
  AlertTriangle, 
  FileSignature,
  ArrowUp,
  ArrowDown,
  PlusCircle,
  X,
  Type,
  FileCheck,
  Calendar,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  CloudLightning,
  RefreshCw,
  EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { 
  googleSignIn, 
  logout, 
  initAuth 
} from "../lib/googleAuth";
import { 
  createFolder, 
  createSpreadsheet, 
  setSpreadsheetHeaders 
} from "../lib/googleDriveSheets";

const DEFAULT_FIELDS: FormField[] = [
  { id: 'fullName', label: 'الاسم رباعي', type: 'text', required: true, system: true, validationType: 'name' },
  { id: 'province', label: 'المحافظة', type: 'text', required: true, system: true },
  { id: 'dob', label: 'تاريخ الميلاد', type: 'date', required: true, system: true },
  { id: 'nationalId', label: 'الرقم القومي', type: 'text', required: true, system: true, validationType: 'national_id' },
  { id: 'score', label: 'المجموع', type: 'number', required: true, system: true, minNumber: 140, maxNumber: 280 },
  { id: 'fatherName', label: 'اسم ولي الأمر', type: 'text', required: true, system: true, validationType: 'name' },
  { id: 'fatherJob', label: 'عمل ولي الأمر', type: 'text', required: true, system: true },
  { id: 'motherName', label: 'اسم الام', type: 'text', required: true, system: true, validationType: 'name' },
  { id: 'motherJob', label: 'عمل الام', type: 'text', required: true, system: true },
  { id: 'phone', label: 'رقم الموبايل', type: 'text', required: true, system: true, validationType: 'phone' },
];

export default function FormTemplateManager() {
  const [settings, setSettings] = useState<SystemSettings>(storage.getSettings());
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    settings.activeFormTemplateId || 'default-form'
  );

  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLinkingId, setIsLinkingId] = useState<string | null>(null);

  // Initialize and listen to Google Auth state
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
    toast.info("تم تسجيل الخروج من حساب جوجل بنجاح.");
  };

  const handleCreateGoogleSheets = async (templateId: string) => {
    const tpl = settings.formTemplates?.find(t => t.id === templateId);
    if (!tpl) return;

    if (!googleToken) {
      toast.error("يرجى تسجيل الدخول بحساب جوجل أولاً من الشريط بالأعلى لتفعيل الربط");
      return;
    }

    if (!settings.googleDriveFolderId) {
      toast.error("عذراً، يجب تحديد مجلد الحفظ الرئيسي للموقع أولاً في شاشة الإعدادات العامة للموقع.");
      return;
    }

    setIsLinkingId(templateId);
    toast.info("جاري إنشاء مجلد مخصص، ومجلد للمرفقات، وجوجل شيت للردود على درايف الخاص بك...");

    try {
      // 1. Create subfolder with the same name as the template
      const folderResult = await createFolder(googleToken, tpl.name, settings.googleDriveFolderId);
      
      // 2. Create nested subfolder for files
      const filesFolderResult = await createFolder(googleToken, `ملفات (${tpl.name})`, folderResult.id);

      // 3. Create Google Sheet response inside the template folder
      const sheetName = `ردود (${tpl.name})`;
      const sheetResult = await createSpreadsheet(googleToken, sheetName, folderResult.id);

      // 4. Set headers
      const defaultHeaders = [
        "رقم التسجيل",
        "الاسم رباعي",
        "المحافظة",
        "تاريخ الميلاد",
        "الرقم القومي",
        "المجموع",
        "اسم ولي الأمر",
        "عمل ولي الأمر",
        "اسم الام",
        "عمل الام",
        "رقم الموبايل",
        "تاريخ التقديم",
        "حالة الطلب"
      ];

      // Add custom fields
      const customHeaders = (tpl.formFields || [])
        .filter(f => !f.system)
        .map(f => f.label);

      const allHeaders = [...defaultHeaders, ...customHeaders];

      if (sheetResult.id) {
        await setSpreadsheetHeaders(googleToken, sheetResult.id, allHeaders);
      }

      // 5. Update settings on state and Storage
      const updatedTpls = (settings.formTemplates || []).map(t => {
        if (t.id === templateId) {
          return {
            ...t,
            spreadsheetId: sheetResult.id,
            spreadsheetUrl: sheetResult.spreadsheetUrl,
            responsesFolderId: folderResult.id,
            filesFolderId: filesFolderResult.id
          };
        }
        return t;
      });

      setSettings(prev => ({
        ...prev,
        formTemplates: updatedTpls
      }));

      toast.success("تم إنشاء وهيكلة شيت الردود ومجلدات الحفظ بنجاح!");
    } catch (err: any) {
      console.error(err);
      if (err.status === 401 || err.message === 'UNAUTHENTICATED') {
        setGoogleToken(null);
        setGoogleUser(null);
        toast.error("انتهت صلاحية جلسة Google. يرجى إعادة تسجيل الدخول من الأعلى.");
      } else {
        toast.error(`فشل تهيئة جوجل درايف: ${err.message || err}`);
      }
    } finally {
      setIsLinkingId(null);
    }
  };

  const handleUnlinkGoogleSheets = (templateId: string) => {
    // We update settings and template properties to un-link
    const updatedTpls = (settings.formTemplates || []).map(t => {
      if (t.id === templateId) {
        return {
          ...t,
          spreadsheetId: undefined,
          spreadsheetUrl: undefined,
          responsesFolderId: undefined,
          filesFolderId: undefined
        };
      }
      return t;
    });

    setSettings(prev => ({
      ...prev,
      formTemplates: updatedTpls
    }));

    toast.success("تم إلغاء الربط بملف جوجل شيت الحالي ومجلدات الصور بنجاح! يمكنك الآن إعادة تهيئة السحابية لإنشاء ملفات ومجلدات جديدة.");
  };

  // Template creation or edit dialogs
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateDialogType, setTemplateDialogType] = useState<'CREATE' | 'RENAME'>('CREATE');
  const [templateDialogName, setTemplateDialogName] = useState("");
  const [targetTemplateId, setTargetTemplateId] = useState<string | null>(null);

  // Auto-save settings in localStorage
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
    toast.success("تم تفعيل ونشر الاستمارة المحددة للطلاب بنجاح لتظهر عند التسجيل.");
  };

  // Handle duplicate template structure
  const handleDuplicateTemplate = (id: string) => {
    const templateToClone = settings.formTemplates?.find(t => t.id === id);
    if (!templateToClone) return;

    const cloned: FormTemplate = {
      id: crypto.randomUUID(),
      name: `${templateToClone.name} - نسخة منسوخة`,
      formFields: templateToClone.formFields.map(f => ({
        ...f,
        id: crypto.randomUUID(), // Complete independence: duplicate all fields with new IDs!
        system: false // Once cloned, they can be customized even more
      })),
      createdAt: new Date().toISOString()
    };

    setSettings(prev => ({
      ...prev,
      formTemplates: [...(prev.formTemplates || []), cloned]
    }));
    toast.success(`تم إنشاء نسخة كربونية جديدة باسم "${cloned.name}"`);
  };

  // Handle delete template
  const handleDeleteTemplate = (id: string) => {
    if (id === settings.activeFormTemplateId) {
      toast.error("عذراً، لا يمكن حذف الاستمارة النشطة حالياً. يرجى تفعيل نموذج آخر أولاً.");
      return;
    }
    if ((settings.formTemplates || []).length <= 1) {
      toast.error("عذراً، يجب الإبقاء على نموذج استمارة واحدة على الأقل في النظام.");
      return;
    }

    setSettings(prev => ({
      ...prev,
      formTemplates: (prev.formTemplates || []).filter(t => t.id !== id)
    }));
    toast.info("تم حذف نموذج الاستمارة بنجاح");
    
    if (selectedTemplateId === id) {
      const remaining = (settings.formTemplates || []).filter(t => t.id !== id);
      setSelectedTemplateId(remaining[0]?.id || 'default-form');
    }
  };

  // Save new or renamed template
  const handleSaveTemplateAction = () => {
    if (!templateDialogName.trim()) {
      toast.error("يرجى كتابة اسم الاستمارة أولاً");
      return;
    }

    if (templateDialogType === 'CREATE') {
      const newTemplate: FormTemplate = {
        id: crypto.randomUUID(),
        name: templateDialogName,
        formFields: JSON.parse(JSON.stringify(DEFAULT_FIELDS)), // deep copy initial templates
        createdAt: new Date().toISOString()
      };
      setSettings(prev => ({
        ...prev,
        formTemplates: [...(prev.formTemplates || []), newTemplate]
      }));
      setSelectedTemplateId(newTemplate.id);
      toast.success("تم إنشاء الاستمارة بنجاح، يمكنك الآن التحكم بحقولها المخصصة وحفظها بالكامل أدناه.");
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

  // Google Forms like interactive operations:
  
  // 1. Add new field
  const handleAddFieldDirectly = () => {
    setSettings(prev => {
      const updatedTemplates = (prev.formTemplates || []).map(t => {
        if (t.id === selectedTemplateId) {
          const newF: FormField = {
            id: 'field_' + Math.random().toString(36).substr(2, 9),
            label: 'حقل جديد غير مسمى',
            type: 'text',
            required: false,
            validationType: 'none'
          };
          return {
            ...t,
            formFields: [...t.formFields, newF]
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
    toast.success("تمت إضافة حقل جديد في نهاية النموذج.");
    
    // Scroll smoothly to bottom
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  // 2. Duplicate specific field (تكرار الخانة)
  const handleDuplicateField = (fieldId: string) => {
    setSettings(prev => {
      const updatedTemplates = (prev.formTemplates || []).map(t => {
        if (t.id === selectedTemplateId) {
          const index = t.formFields.findIndex(f => f.id === fieldId);
          if (index === -1) return t;
          
          const sourceField = t.formFields[index];
          const clonedField: FormField = {
            ...JSON.parse(JSON.stringify(sourceField)),
            id: 'field_' + Math.random().toString(36).substr(2, 9),
            label: `${sourceField.label} (نسخة مكررة)`,
            system: false // copies are fully customizable as standard custom fields
          };
          
          const newFields = [...t.formFields];
          newFields.splice(index + 1, 0, clonedField); // Insert right after source field
          
          return {
            ...t,
            formFields: newFields
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
    toast.success("تم تكرار حقل البيانات بنجاح بنموذج الاستمارة.");
  };

  // 3. Delete specific field
  const handleDeleteField = (fieldId: string) => {
    setSettings(prev => {
      const updatedTemplates = (prev.formTemplates || []).map(t => {
        if (t.id === selectedTemplateId) {
          return {
            ...t,
            formFields: t.formFields.filter(f => f.id !== fieldId)
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
    toast.info("تم حذف حقل البيانات كلياً من نموذج الاستمارة الحالي.");
  };

  // 4. Update field properties inline dynamically
  const handleUpdateFieldProperty = (fieldId: string, property: keyof FormField, value: any) => {
    setSettings(prev => {
      const updatedTemplates = (prev.formTemplates || []).map(t => {
        if (t.id === selectedTemplateId) {
          return {
            ...t,
            formFields: t.formFields.map(f => {
              if (f.id === fieldId) {
                return {
                  ...f,
                  [property]: value
                };
              }
              return f;
            })
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
  };

  // 5. Reorder fields (تحريك لأعلى / لأسفل)
  const handleMoveField = (fieldId: string, direction: 'UP' | 'DOWN') => {
    setSettings(prev => {
      const updatedTemplates = (prev.formTemplates || []).map(t => {
        if (t.id === selectedTemplateId) {
          const index = t.formFields.findIndex(f => f.id === fieldId);
          if (index === -1) return t;
          
          const newFields = [...t.formFields];
          const targetIndex = direction === 'UP' ? index - 1 : index + 1;
          
          if (targetIndex < 0 || targetIndex >= newFields.length) return t; // boundary guard
          
          // Swap positions
          const temp = newFields[index];
          newFields[index] = newFields[targetIndex];
          newFields[targetIndex] = temp;
          
          return {
            ...t,
            formFields: newFields
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
  };

  const activeTemplateObj = (settings.formTemplates || []).find(t => t.id === settings.activeFormTemplateId) || (settings.formTemplates && settings.formTemplates[0]);

  const focusedTemplate = (settings.formTemplates || []).find(t => t.id === selectedTemplateId) 
    || activeTemplateObj 
    || { id: 'default-form', name: 'الاستمارة الأساسية', formFields: settings.formFields || DEFAULT_FIELDS };

  const currentFields = focusedTemplate.formFields || [];

  return (
    <div className="p-3 md:p-6 space-y-5 animate-in fade-in duration-300" dir="rtl">
      
      {/* Dialog for Creating or Renaming Template */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md bg-white rounded-xl shadow-lg border border-slate-200">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <FileSignature className="text-violet-600" size={18} />
              {templateDialogType === 'CREATE' ? "إنشاء نموذج استمارة قبول جديد" : "تعديل مسمى الاستمارة الحالية"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {templateDialogType === 'CREATE' 
                ? "سيتم نسخ هيكل الحقول الأساسية للنظام افتراضياً لتخصيصها بالكامل وتعديلها أو تكرارها أو حذف بعضها فورا." 
                : "غير مسمى نموذج الاستمارة لترتيبها بشكل منظم يسهل توافره للطلاب عند التقدم للبوابة."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 text-right">
            <div className="space-y-1.5 focus:outline-none">
              <Label className="text-xs font-bold text-slate-700">الاسم المقترح للاستمارة *</Label>
              <Input 
                value={templateDialogName} 
                onChange={(e) => setTemplateDialogName(e.target.value)} 
                placeholder="مثال: استمارة القبول بقسم البترول"
                className="text-xs h-10 border-slate-200 focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-start">
            <Button variant="outline" size="sm" className="text-xs h-9 font-medium" onClick={() => setIsTemplateDialogOpen(false)}>إلغاء</Button>
            <Button size="sm" className="text-xs h-9 bg-violet-600 hover:bg-violet-700 px-6 font-bold text-white shadow-sm" onClick={handleSaveTemplateAction}>
              {templateDialogType === 'CREATE' ? "إنشاء الاستمارة" : "تحديث المسمى"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Header Layout */}
      <div className="flex flex-col gap-1.5 text-right border-b border-slate-100 pb-5">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <Layers className="text-violet-600" size={26} />
          <span>إدارة ونمذجة استمارات التقديم المعتمدة</span>
        </h1>
        <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
          نظام محاكي متقدم لـ <strong>Google Forms</strong> بنظام تفاعلي بالكامل: يمكنك تعديل اسم أي خانة، تغيير نوعها، تفعيل إلزامية الإدخال، وضع شروط وقواعد التحقق للمدخلات بالكامل، بالإضافة إلى تكرار أو حذف أو ترتيب الخانات.
        </p>
      </div>

      {/* Tip panel */}
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100/80 rounded-xl p-4 flex items-start gap-3 text-violet-900">
        <AlertTriangle className="shrink-0 text-violet-600 mt-0.5" size={18} />
        <div className="text-xs space-y-1">
          <p className="font-extrabold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse"></span>
            بيئة البناء السحابية التفاعلية المباشرة:
          </p>
          <p className="opacity-90 leading-relaxed font-medium">
            تنعكس فوراً جميع تعديلاتك للحقول وأنواعها واشتراطات التحقق والمرفقات الرقمية المطلوبة على بوابة التقديم الخاصة بالطالب.
          </p>
        </div>
      </div>

      {/* Google Workspace Connection Container */}
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl shrink-0 bg-violet-600 text-white shadow-sm">
            <Wrench size={18} />
          </div>
          <div className="text-right">
            <h3 className="text-xs font-extrabold text-slate-800">
              موقع ربط وإدارة حزم Google Workspace المعتمدة:
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium leading-relaxed">
              تم نقل لوحة الاتصال بحساب Google ومراقبة المزامنة المشتركة بالكامل إلى شاشة <strong>[أدوات المسؤول ⚙️] ← [أدوات متقدمة]</strong> لتسهيل التحكم المركزي وفحص الاتصال المستمر.
            </p>
          </div>
        </div>
      </div>

      {/* Application forms selection and management list */}
      <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 border-b border-slate-100 gap-4 bg-slate-50/40">
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
              <FileSignature size={16} className="text-violet-600" />
              الاستمارات والمسارات المفعلة بالبوابة
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-400">
              قم بإنشاء المسارات الدراسية تبعا لكل استمارة وتفعيل الاستمارة الأساسية للتسجيل حالياً.
            </CardDescription>
          </div>
          <Button 
            size="sm" 
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-9 font-bold shadow-sm" 
            onClick={() => {
              setTemplateDialogType('CREATE');
              setTemplateDialogName("");
              setTargetTemplateId(null);
              setIsTemplateDialogOpen(true);
            }}
          >
            <Plus size={14} className="ml-1" /> إنشاء نموذج استمارة جديد
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 text-[10px] uppercase">
                  <th className="p-4 w-[30%]">اسم الاستمارة وتفاصيلها</th>
                  <th className="p-4">حجم ونوع الحقول</th>
                  <th className="p-4">الحالة للطلاب حالياً</th>
                  <th className="p-4">ملف الردود ومجلدات التخزين</th>
                  <th className="p-4 text-left">إجراءات الإدارة العامة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(settings.formTemplates || []).map((tpl) => {
                  const isActive = settings.activeFormTemplateId === tpl.id;
                  return (
                    <tr key={tpl.id} className={`${isActive ? "bg-violet-50/30" : ""} hover:bg-slate-50/50 transition-colors h-14`}>
                      <td className="p-4 font-bold text-slate-800">
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-900 font-extrabold">{tpl.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono font-medium">Unique Key: {tpl.id}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                          {tpl.formFields?.length || 0} حقل متكامل
                        </span>
                      </td>
                      <td className="p-4">
                        {isActive ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold py-1 px-3 rounded-full shadow-sm inline-flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-emerald-500" /> نشطة وتظهر حالياً للطالب
                          </span>
                        ) : (
                          <span className="text-slate-400 border border-slate-200 text-[10px] font-semibold py-1 px-2.5 rounded-full inline-block">
                            مسودة معطلة
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        {tpl.spreadsheetId ? (
                          <div className="flex flex-col gap-1 text-right">
                            <span className="text-emerald-600 font-extrabold text-[10px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              جاهز ومربوط بجوجل شيتس
                            </span>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <a 
                                href={tpl.spreadsheetUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline text-[10px] inline-flex items-center gap-0.5"
                              >
                                📂 فتح ملف الردود ↗
                              </a>
                              <span className="text-slate-200">|</span>
                              <button 
                                onClick={() => handleUnlinkGoogleSheets(tpl.id)}
                                className="text-rose-500 hover:text-rose-700 font-bold hover:underline text-[10px] cursor-pointer"
                              >
                                🔌 إلغاء الربط وإعادة تهيئة جديدة
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {isLinkingId === tpl.id ? (
                              <Button disabled size="sm" className="bg-slate-100 text-slate-400 border border-slate-200 text-[10px] h-8 font-bold flex items-center gap-1">
                                <RefreshCw className="animate-spin" size={10} /> تهيئة على درايف...
                              </Button>
                            ) : (
                              <Button 
                                size="sm" 
                                className="bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-[10px] h-8 font-bold px-3 transition-colors"
                                onClick={() => handleCreateGoogleSheets(tpl.id)}
                              >
                                ⚡ إنشاء ملف ردود
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-left">
                        <div className="flex items-center gap-1.5 justify-end">
                          {!isActive ? (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 text-[10px] font-black text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 bg-white" 
                              onClick={() => handleActivateTemplate(tpl.id)}
                            >
                              <Check size={12} className="ml-1" /> تفعيل ونشر في البوابة
                            </Button>
                          ) : (
                            <span className="text-[10px] text-emerald-700 font-bold ml-1 flex items-center gap-1 bg-emerald-100/50 border border-emerald-200 px-2 py-1 rounded">
                              <Eye size={11} /> النموذج المعتمد الحالي
                            </span>
                          )}
                          
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 hover:bg-slate-100 rounded-lg" 
                            onClick={() => handleDuplicateTemplate(tpl.id)}
                            title="عمل نسخة مطابقة تفصيلية"
                          >
                            <Copy size={13} className="text-slate-500 hover:text-violet-600" />
                          </Button>
                          
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 hover:bg-slate-100 rounded-lg" 
                            onClick={() => {
                              setTemplateDialogType('RENAME');
                              setTemplateDialogName(tpl.name);
                              setTargetTemplateId(tpl.id);
                              setIsTemplateDialogOpen(true);
                            }}
                            title="تعديل المسمى"
                          >
                            <Wrench size={12} className="text-slate-500 hover:text-amber-600" />
                          </Button>
                          
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 hover:bg-slate-100 rounded-lg" 
                            disabled={isActive}
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            title="حذف الاستمارة تماماً"
                          >
                            <Trash2 size={13} className={isActive ? "text-slate-200" : "text-slate-400 hover:text-red-500"} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>


      {/* GOOGLE FORMS LIKE DYNAMIC WORKSPACE CARD CONTAINER */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-2 gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-6 rounded bg-violet-600"></span>
              بيئة البناء التفاعلية (Google Forms UI)
            </h2>
            <p className="text-xs text-slate-400 mt-1">تحديد حقول الاستمارة المرغوبة وتخصيص البيانات والتحققات لكل حقل على حدة.</p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1.5 border border-slate-200/50 rounded-xl">
            <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap px-1.5">الاستمارة الجاري تخصيصها:</span>
            <Select 
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger className="text-xs h-8 bg-white border-slate-200 w-64 rounded-md font-bold text-slate-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(settings.formTemplates || []).map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs font-bold text-violet-700">
                    {t.name} {t.id === settings.activeFormTemplateId && "(النشطة)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dynamic List of Fields Styled elegant like Google Forms question cards */}
        <div className="space-y-3 transition-all pr-0">
          {currentFields.length > 0 ? (
            currentFields.map((field, idx) => {
              // Build dynamic icons depending on field type
              const getFieldIcon = () => {
                switch(field.type) {
                  case 'number': return <span className="bg-amber-100 text-amber-700 font-bold p-1 px-2 rounded text-[10px] uppercase font-mono">123</span>;
                  case 'date': return <Calendar size={14} className="text-emerald-500" />;
                  case 'select': return <Wrench size={14} className="text-blue-500" />;
                  case 'file': return <FileCheck size={14} className="text-indigo-500" />;
                  case 'image': return <ImageIcon size={14} className="text-purple-500" />;
                  default: return <Type size={14} className="text-slate-500" />;
                }
              };

              return (
                <div 
                  key={field.id}
                  className="group relative bg-white rounded-xl border border-slate-200 hover:border-violet-300 shadow-sm hover:shadow transition-all overflow-visible pl-2 border-r-4 border-r-violet-500/80"
                >
                  <CardContent className="p-3.5 md:p-4 space-y-3">
                    {/* Header Row: Index Number and Quick Move controls */}
                    <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-violet-50 text-violet-700 flex items-center justify-center font-mono text-[10px] font-black">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Field Key: {field.id}</span>
                        {field.system && (
                          <span className="bg-slate-100 hover:bg-slate-150 text-slate-500 rounded px-2 py-0.5 text-[8px] font-bold inline-flex items-center gap-1 cursor-not-allowed">
                            <Lock size={8} /> حقل موروث
                          </span>
                        )}
                        {field.hidden && (
                          <span className="bg-rose-50 border border-rose-100 text-rose-600 rounded px-2 py-0.5 text-[8px] font-extrabold inline-flex items-center gap-1">
                            <EyeOff size={8} /> مخفي عن الطالب
                          </span>
                        )}
                      </div>

                      {/* Reordering Controls (تحريك لأعلى ولأسفل) */}
                      <div className="flex items-center gap-1 text-[9px]">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          disabled={idx === 0}
                          className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30"
                          onClick={() => handleMoveField(field.id, 'UP')}
                          title="تحريك للأعلى"
                          type="button"
                        >
                          <ArrowUp size={12} className="text-slate-500" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          disabled={idx === currentFields.length - 1}
                          className="h-6 w-6 rounded hover:bg-slate-100 disabled:opacity-30"
                          onClick={() => handleMoveField(field.id, 'DOWN')}
                          title="تحريك للأسفل"
                          type="button"
                        >
                          <ArrowDown size={12} className="text-slate-500" />
                        </Button>
                      </div>
                    </div>

                    {/* Main config: Label Input, Type Select and Validation Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start pt-1">
                      {/* 1. Label name Input */}
                      <div className="md:col-span-6 space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500">اسم الخانة (السؤال المعروض للطالب)</Label>
                        <Input 
                          value={field.label}
                          onChange={(e) => handleUpdateFieldProperty(field.id, 'label', e.target.value)}
                          placeholder="أدخل مسمى الخانة بالكامل للطلاب..."
                          className="text-xs h-10 border-slate-200 focus:ring-1 focus:ring-violet-500 font-bold text-slate-800"
                        />
                      </div>

                      {/* 2. UI Type Select */}
                      <div className="md:col-span-3 space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500">نوع الخانة واستجابتها</Label>
                        <Select 
                          value={field.type}
                          onValueChange={(val) => {
                            handleUpdateFieldProperty(field.id, 'type', val);
                            if (val !== 'select') {
                              handleUpdateFieldProperty(field.id, 'options', undefined);
                            } else {
                              handleUpdateFieldProperty(field.id, 'options', ['خيار أول', 'خيار ثاني']);
                            }
                          }}
                        >
                          <SelectTrigger className="text-xs h-10 border-slate-200 bg-white font-medium text-slate-800">
                            <span className="flex items-center gap-1.5 w-full text-right justify-start">
                              {getFieldIcon()}
                              <SelectValue placeholder="اختر النوع" />
                            </span>
                          </SelectTrigger>
                          <SelectContent className="bg-white">
                            <SelectItem value="text" className="text-xs text-right">نصي عادي (Text)</SelectItem>
                            <SelectItem value="number" className="text-xs font-bold text-right">حقل رقمي (Number)</SelectItem>
                            <SelectItem value="date" className="text-xs text-right">تاريخ (Date)</SelectItem>
                            <SelectItem value="select" className="text-xs text-right">قائمة خيارات منسدلة (Google Dropdown)</SelectItem>
                            <SelectItem value="file" className="text-xs text-right">ملف مرفق عام (File Document)</SelectItem>
                            <SelectItem value="image" className="text-xs text-right">صورة مرفقة ملونة (Image file)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 3. Logic Validation Condition (شروط التحقق) */}
                      <div className="md:col-span-3 space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500">شرط التحقق المتقدم للمدخلات</Label>
                        <Select 
                          value={field.validationType || 'none'}
                          onValueChange={(val) => handleUpdateFieldProperty(field.id, 'validationType', val)}
                        >
                          <SelectTrigger className="text-xs h-10 border-slate-200 bg-white font-medium text-slate-700">
                            <span className="flex items-center gap-1.5 w-full text-right justify-start">
                              <SelectValue placeholder="شرط التحقق" />
                            </span>
                          </SelectTrigger>
                          <SelectContent className="bg-white">
                            <SelectItem value="none" className="text-xs text-right">لا يوجد شرط تحقق إضافي</SelectItem>
                            <SelectItem value="name" className="text-xs text-right">اسم رباعي بالعربية فقط (Name)</SelectItem>
                            <SelectItem value="phone" className="text-xs text-right">رقم موبايل مصري (11 رقم) (Phone)</SelectItem>
                            <SelectItem value="email" className="text-xs text-right">بريد إلكتروني صالح (Email)</SelectItem>
                            <SelectItem value="national_id" className="text-xs text-right">رقم قومي مصري (14 رقم) (National ID)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Numeric Range Bounds (If validation range logic required) */}
                    {field.type === 'number' && (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-wrap gap-4 items-center">
                        <span className="text-[10px] font-bold text-slate-400">تحديد نطاق الأرقام المقبولة للطلاب:</span>
                        <div className="flex items-center gap-2">
                          <Label className="text-[9px] text-slate-500">الحد الأدنى لقبول الرقم:</Label>
                          <Input 
                            type="number"
                            className="w-24 h-7 text-xs"
                            value={field.minNumber !== undefined ? field.minNumber : ""}
                            onChange={(e) => handleUpdateFieldProperty(field.id, 'minNumber', e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="مثال: 140"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[9px] text-slate-500">الحد الأقصى المسموح به:</Label>
                          <Input 
                            type="number"
                            className="w-24 h-7 text-xs"
                            value={field.maxNumber !== undefined ? field.maxNumber : ""}
                            onChange={(e) => handleUpdateFieldProperty(field.id, 'maxNumber', e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="مثال: 280"
                          />
                        </div>
                      </div>
                    )}

                    {/* Sub panel: If Choose Dropdown 'select' type -> inline dynamic options list */}
                    {field.type === 'select' && (
                      <div className="bg-violet-50/20 p-4 rounded-xl border border-violet-100/50 space-y-2">
                        <Label className="text-[10px] font-black text-violet-700 flex items-center gap-1">
                          <PlusCircle size={10} /> خيارات القائمة المنسدلة للطلاب (Google Options Mode)
                        </Label>
                        
                        <div className="flex flex-wrap gap-2 items-center">
                          {(field.options || []).map((option, optIdx) => (
                            <div key={optIdx} className="flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-1">
                              <Input 
                                className="w-28 h-6 text-[10px] border-none focus-visible:ring-0 p-0 font-bold"
                                value={option}
                                onChange={(e) => {
                                  const currentOpts = [...(field.options || [])];
                                  currentOpts[optIdx] = e.target.value;
                                  handleUpdateFieldProperty(field.id, 'options', currentOpts);
                                }}
                              />
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-4 w-4 text-red-400 hover:text-red-500 rounded"
                                onClick={() => {
                                  const currentOpts = (field.options || []).filter((_, o) => o !== optIdx);
                                  handleUpdateFieldProperty(field.id, 'options', currentOpts);
                                }}
                              >
                                <X size={10} />
                              </Button>
                            </div>
                          ))}

                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-[9px] bg-white text-violet-600 hover:bg-violet-50 border-violet-200"
                            onClick={() => {
                              const currentOpts = [...(field.options || []), `خيار جديد #${(field.options || []).length + 1}`];
                              handleUpdateFieldProperty(field.id, 'options', currentOpts);
                            }}
                          >
                            <Plus size={10} className="ml-1" /> إضافة خيار جديد
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Bottom Actions Row mirroring Google Forms design */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1 text-slate-500 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-100">
                          <input 
                            type="checkbox"
                            id={`req-${field.id}`}
                            checked={field.required}
                            onChange={(e) => handleUpdateFieldProperty(field.id, 'required', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer accent-violet-600"
                          />
                          <Label 
                            htmlFor={`req-${field.id}`}
                            className="text-[10px] font-black text-slate-700 hover:text-slate-900 cursor-pointer select-none"
                          >
                            مطلوب
                          </Label>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-100">
                          <input 
                            type="checkbox"
                            id={`hid-${field.id}`}
                            checked={!!field.hidden}
                            onChange={(e) => handleUpdateFieldProperty(field.id, 'hidden', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                          />
                          <Label 
                            htmlFor={`hid-${field.id}`}
                            className="text-[10px] font-black text-rose-700 hover:text-rose-900 cursor-pointer select-none"
                          >
                            مخفي عن الطالب
                          </Label>
                        </div>
                      </div>

                      {/* Duplicate (تكرار) and Trash (حذف) Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost" 
                          size="sm"
                          className="h-8 text-[10px] font-bold text-slate-500 hover:text-violet-600 hover:bg-violet-50"
                          onClick={() => handleDuplicateField(field.id)}
                        >
                          <Copy size={12} className="ml-1" /> تكرار الخانة
                        </Button>

                        <div className="w-[1px] h-4 bg-slate-200"></div>

                        <Button
                          variant="ghost" 
                          size="sm"
                          className="h-8 text-[10px] font-bold text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteField(field.id)}
                        >
                          <Trash2 size={12} className="ml-1" /> حذف
                        </Button>
                      </div>
                    </div>

                  </CardContent>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-bold">
               لا يوجد حقول مخصصة في هذا النموذج للتعديل، اضغط على زر إضافة حقل للبدء.
            </div>
          )}
        </div>

        {/* Append new field action bottom bar */}
        <div className="flex items-center justify-center py-4 bg-white/70 border border-slate-200 rounded-xl mt-6 shadow-sm">
          <Button 
            className="bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs h-10 px-8 shadow-sm flex items-center gap-1.5"
            onClick={handleAddFieldDirectly}
          >
            <Plus size={16} /> إضافة حقل مخصص جديد (سؤال للطلاب)
          </Button>
        </div>

      </div>

    </div>
  );
}
