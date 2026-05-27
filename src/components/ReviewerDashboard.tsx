/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { storage } from "../lib/storage";
import { getApiUrl } from "../lib/api";
import { StudentApplication, ApplicationStatus } from "../types";
import { Search, Eye, FileCheck, Check, X, AlertTriangle, MessageSquare, Mail, User, Cloud, ExternalLink, Download, Image as ImageIcon, CheckCircle2, Loader2, LogOut, RefreshCw, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";
import { initAuth, googleSignIn, logout, getAccessToken } from "../lib/googleAuth";
import { findFolderByName, createFolder, uploadFileToDrive, appendSpreadsheetRow } from "../lib/googleDriveSheets";

function DriveImage({ url, className, alt, onClick }: { url: any, className?: string, alt?: string, onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  
  useEffect(() => {
    let currentUrl = typeof url === 'string' ? url : (url?.dataUrl || url?.url);
    if (!currentUrl) {
      setSrc(null);
      return;
    }

    if (currentUrl.startsWith('data:')) {
      setSrc(currentUrl);
      return;
    }

    if (currentUrl && typeof currentUrl === 'string' && currentUrl.includes('drive.google.com')) {
      const fileId = currentUrl.match(/id=([a-zA-Z0-9-_]+)/)?.[1] || currentUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (fileId) {
        setSrc(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`);
        return;
      }
    }

    setSrc(currentUrl);
  }, [url]);

  if (!src) return <div className={`${className} bg-slate-100 flex items-center justify-center`}><ImageIcon size={16} className="text-slate-300" /></div>;

  return (
    <img 
      src={src} 
      alt={alt} 
      className={className} 
      referrerPolicy="no-referrer" 
      onClick={onClick}
      crossOrigin="anonymous"
    />
  );
}

export default function ReviewerDashboard() {
  const [apps, setApps] = useState<StudentApplication[]>(storage.getApplications());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedApp, setSelectedApp] = useState<StudentApplication | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [note, setNote] = useState("");
  
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string, name: string } | null>(null);

  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  const handlePreview = (value: any, label: string) => {
    const src = typeof value === 'string' ? value : (value?.dataUrl || value?.url);
    if (!src) return;

    if (src.includes('drive.google.com')) {
      const fileId = src.match(/id=([a-zA-Z0-9-_]+)/)?.[1] || src.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (fileId) {
        setPreviewImage({ url: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`, name: label });
        return;
      }
    }
    setPreviewImage({ url: src, name: label });
  };

  const CANNED_REASONS = [
    "بيانات غير صحيحة",
    "المجموع اقل من المطلوب",
    "المحافظة غير مسموح لها بالتقديم",
    "الصور غير واضحة",
    "صورة الطالب ليست بالشكل المطلوب",
    "بطاقة الرقم القومي منتهية",
    "الصور ليست بالدقة المطلوبة",
    "كود طالب خاطئ",
    "رقم قومي خاطئ",
    "السن غير مطابق"
  ];

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

  const handleGoogleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        toast.success("تم تسجيل الدخول بحساب جوجل بنجاح");
      }
    } catch (err: any) {
      toast.error("فشل تسجيل الدخول: " + err.message);
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setGoogleUser(null);
    setGoogleToken(null);
  };

  const syncToSheets = async (app: StudentApplication) => {
    const token = googleToken || await getAccessToken();
    if (!token) {
      toast.error("يرجى تسجيل الدخول بحساب جوجل أولاً");
      return;
    }

    const settings = storage.getSettings();
    const activeTemplate = (settings.formTemplates || []).find(t => t.id === settings.activeFormTemplateId);
    const spreadsheetId = activeTemplate?.spreadsheetId || settings.spreadsheetId;
    
    if (!activeTemplate || !spreadsheetId) {
      toast.error("لا يوجد ملف Google Sheet مربوط بهذا النموذج");
      return;
    }

    setIsSyncing(true);
    try {
      const mainFolderId = settings.googleDriveFolderId;
      const customDataWithLinks = { ...(app.customData || {}) };
      
      // Before building row, try to upload any local base64 images if they aren't uploaded yet
      const activeFieldsForUpload = storage.getActiveFormFields();
      if (mainFolderId) {
        for (const field of activeFieldsForUpload) {
          const val = customDataWithLinks[field.id];
          if (val && typeof val === 'object' && val.dataUrl && val.dataUrl.startsWith('data:')) {
            try {
               const url = await uploadFileToDrive(token, mainFolderId, `${field.label}_${app.registrationNumber}`, val.dataUrl);
               customDataWithLinks[field.id] = url;
            } catch (e) {
               console.error("Delayed upload failed", e);
            }
          }
        }
      }

      // Build row similar to RegistrationForm
      const rowValues = [
        app.registrationNumber,
        app.fullName,
        app.province,
        app.dob,
        app.nationalId,
        app.score,
        app.fatherName,
        app.fatherJob,
        app.motherName,
        app.motherJob,
        app.phone,
        app.createdAt,
        app.status === 'ACCEPTED' ? 'مقبول' : 
        app.status === 'REJECTED' ? 'مرفوض نهائياً' : 
        app.status === 'REVISION_REQUESTED' ? 'مطلوب تعديل' :
        app.status === 'INCOMPLETE' ? 'بيانات ناقصة' : 'قيد المراجعة'
      ];

      // Add custom fields
      activeFieldsForUpload.filter(f => !f.system).forEach(field => {
        const val = customDataWithLinks[field.id];
        if (val && typeof val === 'object') {
          // Final safety check to prevent base64 in sheets
          if (val.dataUrl && val.dataUrl.startsWith('data:')) {
            rowValues.push("[Image Stored Locally]");
          } else {
            rowValues.push(val.url || val.name || "");
          }
        } else {
          const strVal = String(val || "");
          if (strVal.startsWith('data:')) {
            rowValues.push("[Large Data - See Drive]");
          } else {
            rowValues.push(strVal);
          }
        }
      });

      await appendSpreadsheetRow(token, spreadsheetId, rowValues);
      
      // Update local status
      const syncedApp = { ...app, cloudSynced: true };
      await storage.saveApplication(syncedApp);
      setApps(storage.getApplications());
      
      toast.success("تمت مزامنة البيانات مع Google Sheet بنجاح");
    } catch (err: any) {
      console.error("Sync error:", err);
      if (err.status === 401 || err.message === 'UNAUTHENTICATED') {
        setGoogleToken(null);
        setGoogleUser(null);
        toast.error("انتهت صلاحية جلسة Google. يرجى إعادة تسجيل الدخول بحساب جوجل للمزامنة.");
      } else {
        toast.error("فشل المزامنة: " + err.message);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const exportFilesToDrive = async (app: StudentApplication) => {
    const token = googleToken || await getAccessToken();
    if (!token) {
      toast.error("يرجى تسجيل الدخول بحساب جوجل أولاً");
      return;
    }

    const settings = storage.getSettings();
    const activeTemplate = (settings.formTemplates || []).find(t => t.id === settings.activeFormTemplateId);
    const mainFolderId = settings.googleDriveFolderId; // This is the root folder in settings

    if (!mainFolderId) {
      toast.error("يرجى تحديد المجلد الرئيسي لجوجل درايف في الإعدادات أولاً");
      return;
    }

    setIsSyncing(true);
    try {
      const formName = activeTemplate?.name || "استمارة غير مسماة";
      const reviewFolderName = `مراجعة (${formName})`;
      
      // 1. Find or Create "Review (Form Name)" folder
      let reviewFolderId = await findFolderByName(token, reviewFolderName, mainFolderId);
      if (!reviewFolderId) {
        const created = await createFolder(token, reviewFolderName, mainFolderId);
        reviewFolderId = created.id;
      }

      // 2. Find or Create "Student Name _ RegNum" folder
      const studentFolderName = `${app.fullName}_${app.registrationNumber}`;
      let studentFolderId = await findFolderByName(token, studentFolderName, reviewFolderId);
      if (!studentFolderId) {
        const created = await createFolder(token, studentFolderName, reviewFolderId);
        studentFolderId = created.id;
      }

      // 3. Upload all images/files
      const activeFields = storage.getActiveFormFields();
      const fileFields = activeFields.filter(f => (f.type === 'file' || f.type === 'image'));
      
      let uploadCount = 0;
      for (const field of fileFields) {
        const fileObj = app.customData?.[field.id];
        if (fileObj && typeof fileObj === 'object' && fileObj.dataUrl) {
          await uploadFileToDrive(token, studentFolderId, `${field.label}_${fileObj.name}`, fileObj.dataUrl);
          uploadCount++;
        }
      }

      // Also check standard documents if they have dataUrl
      if (app.documents?.personalPhoto?.startsWith('data:')) {
        await uploadFileToDrive(token, studentFolderId, `صورة_شخصية.png`, app.documents.personalPhoto);
        uploadCount++;
      }
      if (app.documents?.birthCertificate?.startsWith('data:')) {
        await uploadFileToDrive(token, studentFolderId, `شهادة_ميلاد.png`, app.documents.birthCertificate);
        uploadCount++;
      }

      toast.success(`تم إنشاء المجلد بنجاح ورفع ${uploadCount} ملفات إلى Google Drive`);
    } catch (err: any) {
      console.error("Export error:", err);
      if (err.status === 401) {
        toast.error("انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول بحساب جوجل للتصدير");
      } else {
        toast.error("فشل التصدير: " + err.message);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const activeFields = storage.getActiveFormFields();
  const customFields = activeFields.filter(f => !f.system);

  const filteredApps = apps.filter(app => 
    app.fullName.includes(searchTerm) || app.registrationNumber.includes(searchTerm)
  );

  const updateStatus = async (status: ApplicationStatus) => {
    if (!selectedApp) return;
    
    // Combine selected reasons with any manual notes
    const reasonsText = selectedReasons.join(" - ");
    const finalNote = reasonsText 
      ? (selectedApp.notes ? `${reasonsText} | الملاحظات: ${selectedApp.notes}` : reasonsText)
      : (selectedApp.notes || "");

    const updated = { 
      ...selectedApp, 
      status, 
      notes: finalNote, 
      examDate: status === 'ACCEPTED' ? '2024-07-15' : undefined,
      updatedAt: new Date().toISOString()
    };

    await storage.saveApplication(updated);
    
    // Auto-sync to sheets if connected
    if (googleToken) {
      syncToSheets(updated);
    }

    setApps(storage.getApplications());
    setIsReviewOpen(false);
    setSelectedReasons([]);
    toast.success(`تم تحديث حالة الطلب إلى: ${status}`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Navigation Header */}
      <div className="flex justify-start mb-2">
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="text-[10px] font-bold text-slate-400">
          &larr; العودة للرئيسية
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">سجل طلبات الالتحاق</h1>
          <p className="text-xs text-slate-500">إدارة ومراجعة ملفات الطلاب المتقدمين للعام الدراسي الحالي</p>
        </div>
        
        <div className="flex items-center gap-2">
          {googleUser ? (
            <div className="flex items-center gap-3 bg-white border border-emerald-100 rounded-full pl-4 pr-1 py-1 shadow-sm">
               <span className="text-[10px] font-bold text-emerald-700 hidden sm:inline">متصل بجوجل: {googleUser.email}</span>
               <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full text-slate-400 hover:text-red-500" onClick={handleGoogleSignOut}>
                 <LogOut size={14} />
               </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-9 px-3 text-[10px] font-bold bg-white border-blue-200 text-blue-700 hover:bg-blue-50" onClick={handleGoogleSignIn}>
              <Cloud size={14} className="ml-2" /> ربط حساب جوجل للخدمات السحابية
            </Button>
          )}

          <div className="relative">
            <Search className="absolute right-3 top-2.5 text-slate-400" size={14} />
            <Input 
              placeholder="بحث بالاسم أو الرقم..." 
              className="pr-9 h-9 text-xs w-56 bg-white border-slate-200" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card className="high-density-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10">رقم القيد</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10">الاسم الرباعي</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10">المجموع الكلي</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10">المحافظة</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10">حالة الطلب</TableHead>
                <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider h-10">المزامنة</TableHead>
                <TableHead className="text-left text-[10px] uppercase font-bold tracking-wider h-10">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApps.length > 0 ? filteredApps.map((app) => (
                <TableRow key={app.id} className="hover:bg-slate-50 transition-colors h-14">
                  <TableCell className="font-mono text-[11px] font-bold text-slate-500">#{app.registrationNumber}</TableCell>
                  <TableCell className="text-xs font-semibold text-slate-900">{app.fullName}</TableCell>
                  <TableCell className="text-xs font-bold text-slate-700">{app.score}</TableCell>
                  <TableCell className="text-xs text-slate-600">{app.province}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] font-bold px-2 py-0.5 h-5 ${
                      app.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                      app.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-100' : 
                      app.status === 'REVISION_REQUESTED' ? 'bg-amber-50 text-amber-700 border-amber-100' : 
                      app.status === 'INCOMPLETE' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`} variant="outline">
                      {app.status === 'ACCEPTED' ? 'مقبول مبدئياً' : 
                       app.status === 'REJECTED' ? 'مرفوض نهائياً' : 
                       app.status === 'REVISION_REQUESTED' ? 'فرصة تعديل' :
                       app.status === 'INCOMPLETE' ? 'بيانات ناقصة' : 'قيد المراجعة'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {app.cloudSynced ? (
                      <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 flex items-center justify-center gap-1 w-fit h-5 text-[9px] font-bold" variant="outline">
                        <Check size={10} /> متزامن
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-50 text-slate-400 border-slate-100 flex items-center justify-center gap-1 w-fit h-5 text-[9px] font-bold" variant="outline">
                        <Cloud size={10} /> محلي
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-left">
                    <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold bg-white hover:bg-slate-50" onClick={() => { setSelectedApp(app); setIsReviewOpen(true); }}>
                      <Eye size={12} className="ml-1.5" /> فحص الملف
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                   <TableCell colSpan={6} className="h-32 text-center text-xs text-slate-400">لا توجد طلبات تطابق معايير البحث</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 border-none rounded-xl" dir="rtl">
          <div className="bg-slate-900 p-8 text-white">
            <DialogHeader className="space-y-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
                   <User size={32} />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold tracking-tight">فحص ملف: {selectedApp?.fullName}</DialogTitle>
                  <DialogDescription className="text-slate-400 text-sm font-mono mt-1">REGISTRATION_ID: {selectedApp?.registrationNumber} // ID: {selectedApp?.nationalId}</DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-3 flex items-center gap-2">
                     <span className="w-4 h-0.5 bg-blue-600"></span> البيانات الأكاديمية والأساسية
                  </h4>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase tracking-tighter">المجموع الكلي</p>
                      <p className="font-bold text-slate-900 text-sm">{selectedApp?.score} درجة</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase tracking-tighter">المحافظة</p>
                      <p className="font-bold text-slate-900 text-sm">{selectedApp?.province}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase tracking-tighter">تاريخ الميلاد</p>
                      <p className="font-bold text-slate-900 text-sm">{selectedApp?.dob}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase tracking-tighter">رقم التواصل</p>
                      <p className="font-bold text-slate-900 text-sm">{selectedApp?.phone}</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-3 flex items-center gap-2">
                     <span className="w-4 h-0.5 bg-blue-600"></span> بيانات الوالدين
                  </h4>
                  <div className="grid grid-cols-1 gap-4 text-xs">
                    <div className="p-3 border border-slate-100 rounded-lg bg-white shadow-sm">
                       <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase">الأب / ولي الأمر</p>
                       <p className="font-bold text-slate-900 mb-1">{selectedApp?.fatherName}</p>
                       <p className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md inline-block">الوظيفة: {selectedApp?.fatherJob}</p>
                    </div>
                    <div className="p-3 border border-slate-100 rounded-lg bg-white shadow-sm">
                       <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase">الأم</p>
                       <p className="font-bold text-slate-900 mb-1">{selectedApp?.motherName}</p>
                       <p className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md inline-block">الوظيفة: {selectedApp?.motherJob}</p>
                    </div>
                  </div>
                </section>

                {customFields.filter(f => f.type !== 'file' && f.type !== 'image').length > 0 && selectedApp?.customData && (
                  <section className="mt-6">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-3 flex items-center gap-2">
                       <span className="w-4 h-0.5 bg-blue-600"></span> بيانات إضافية مخصصة للتقديم
                    </h4>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100/80">
                      {customFields
                        .filter(f => f.type !== 'file' && f.type !== 'image')
                        .map((field) => {
                          const answer = selectedApp?.customData?.[field.id];
                          return (
                            <div key={field.id}>
                              <p className="text-[10px] text-slate-400 font-bold mb-0.5 uppercase tracking-tighter">{field.label}</p>
                              <p className="font-bold text-slate-900 text-xs">
                                {answer !== undefined && answer !== null && String(answer).trim() !== "" ? String(answer) : <span className="text-slate-300 italic">غير مسجل</span>}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">المستندات والملفات المرفقة</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Deduplicated loop to display all attachment fields without any repetition */}
                  {(() => {
                    const attachments = activeFields.filter(f => f.type === 'file' || f.type === 'image');
                    const uniqueFields: any[] = [];
                    const seenIds = new Set();
                    const seenLabels = new Set();
                    
                    attachments.forEach(f => {
                       // Deduplicate by ID and Label (case insensitive and trimmed for labels)
                       const labelKey = f.label.trim();
                       if (!seenIds.has(f.id) && !seenLabels.has(labelKey)) {
                         uniqueFields.push(f);
                         seenIds.add(f.id);
                         seenLabels.add(labelKey);
                       }
                    });
                    return uniqueFields;
                  })().map((field) => {
                    const docValue = selectedApp?.documents?.[field.id as keyof typeof selectedApp.documents];
                    const customValue = selectedApp?.customData?.[field.id];
                    const finalValue = docValue || customValue;
                    const finalUrl = typeof finalValue === 'string' ? finalValue : (finalValue?.dataUrl || finalValue?.url);
                    const isCloud = typeof finalUrl === 'string' && finalUrl.startsWith('http');
                    const isDataUrl = typeof finalUrl === 'string' && finalUrl.startsWith('data:');
                    const isImage = isDataUrl ? finalUrl.startsWith('data:image') : true;

                    return (
                      <div key={field.id} className={`border border-slate-150 p-3 rounded-xl flex flex-col space-y-2 ${field.system ? 'bg-slate-50/50' : 'bg-indigo-50/30 border-indigo-100'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold ${field.system ? 'text-slate-500' : 'text-indigo-600'}`}>
                            {field.label}
                          </span>
                          {!field.system && <Badge className="text-[8px] bg-indigo-100 text-indigo-700 border-none px-1.5 h-4">مرفق مخصص</Badge>}
                        </div>
                        {finalUrl ? (
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-3 shadow-sm">
                            <div className="flex items-center gap-2.5 truncate">
                              {(isDataUrl || isCloud) && isImage ? (
                                <div className="relative group cursor-zoom-in" onClick={() => handlePreview(finalValue, field.label)}>
                                  <DriveImage url={finalValue} alt={field.label} className="w-14 h-14 rounded-md object-cover border border-slate-100 group-hover:opacity-90 transition-all" />
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 rounded-md">
                                    <Eye size={16} className="text-white drop-shadow-md" />
                                  </div>
                                </div>
                              ) : (
                                <div className="w-14 h-14 bg-slate-100 rounded flex items-center justify-center cursor-pointer" onClick={() => handlePreview(finalValue, field.label)}>
                                  <ImageIcon size={16} className="text-slate-400" />
                                </div>
                              )}
                              <div className="truncate text-right">
                                <p className="text-[10px] font-bold text-slate-800 truncate max-w-[150px]">{isCloud ? "رابط سحابي" : "ملف محلي"}</p>
                                <p className="text-[9px] text-slate-400 font-mono font-medium mt-0.5">{isCloud ? "Google Drive" : "Internal"}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => handlePreview(finalValue, field.label)} 
                              className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50/50 px-2 py-1 rounded cursor-pointer border-none"
                            >
                              {isCloud ? "معاينة الملف" : "فتح محلي"}
                            </button>
                          </div>
                        ) : (
                          <div className="h-16 bg-white border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center space-y-1">
                             <ImageIcon size={16} className="text-slate-200" />
                             <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-center">لم يتم إرفاق هذا المستند</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {selectedApp?.customData?.parentInquiries && selectedApp.customData.parentInquiries.length > 0 && (
              <div className="space-y-4 p-5 bg-indigo-50/55 rounded-2xl border border-indigo-100/80 mb-6 mx-8">
                 <div className="flex items-center gap-2 text-indigo-900">
                   <MessageSquare className="text-indigo-600" size={16} />
                   <h4 className="text-xs font-black">استفسارات ورسائل ولي الأمر:</h4>
                 </div>
                 <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-2">
                    {selectedApp.customData.parentInquiries.map((inq: any) => (
                      <div key={inq.id} className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                        inq.sender === 'PARENT' ? 'bg-indigo-100/80 text-indigo-950 font-extrabold mr-4 text-right' : 'bg-slate-100 text-slate-700 ml-4 text-right'
                      }`}>
                         <p className="text-[9px] font-bold opacity-75 mb-0.5">
                           {inq.sender === 'PARENT' ? 'ولي الأمر' : 'إجابة اللجنة'}
                         </p>
                         <p className="font-semibold">{inq.message}</p>
                      </div>
                    ))}
                 </div>
                 <div className="flex gap-2">
                    <Input 
                      placeholder="اكتب رد اللجنة السريع على استفسار ولي الأمر..." 
                      className="h-10 text-xs bg-white border-slate-200"
                      id="admin-reply-input"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value;
                          if (!val.trim() || !selectedApp) return;
                          
                          const newInq = {
                            id: crypto.randomUUID(),
                            sender: 'ADMIN',
                            message: val.trim(),
                            timestamp: new Date().toISOString()
                          };
                          
                          const updatedInquiries = [...(selectedApp.customData.parentInquiries || []), newInq];
                          const updatedApp = {
                            ...selectedApp,
                            customData: {
                              ...selectedApp.customData,
                              parentInquiries: updatedInquiries
                            }
                          };
                          
                          setSelectedApp(updatedApp);
                          await storage.saveApplication(updatedApp);
                          setApps(storage.getApplications());
                          (e.target as HTMLInputElement).value = "";
                          toast.success("تم إرسال رد اللجنة إلى بوابة ولي الأمر");
                        }
                      }}
                    />
                    <Button 
                      size="sm" 
                      className="bg-indigo-600 font-bold h-10 px-4 whitespace-nowrap"
                      onClick={async () => {
                        const el = document.getElementById('admin-reply-input') as HTMLInputElement;
                        if (!el || !el.value.trim() || !selectedApp) return;
                        const val = el.value;
                        
                        const newInq = {
                          id: crypto.randomUUID(),
                          sender: 'ADMIN',
                          message: val.trim(),
                          timestamp: new Date().toISOString()
                        };
                        
                        const updatedInquiries = [...(selectedApp.customData.parentInquiries || []), newInq];
                        const updatedApp = {
                          ...selectedApp,
                          customData: {
                            ...selectedApp.customData,
                            parentInquiries: updatedInquiries
                          }
                        };
                        
                        setSelectedApp(updatedApp);
                        await storage.saveApplication(updatedApp);
                        setApps(storage.getApplications());
                        el.value = "";
                        toast.success("تم إرسال رد اللجنة إلى بوابة ولي الأمر");
                      }}
                    >
                      إرسال الرد
                    </Button>
                 </div>
              </div>
            )}

            <div className="space-y-4 pt-4 border-t border-slate-100">
               <div className="flex items-center gap-2 mb-1">
                 <MessageSquare size={14} className="text-slate-400" />
                 <span className="text-[10px] font-bold text-slate-500">اختر أسباب الرفض أو الملاحظات الجاهزة:</span>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-4 bg-slate-50 rounded-xl border border-slate-100">
                  {CANNED_REASONS.map(reason => (
                    <label key={reason} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-indigo-50/30 transition-colors group">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedReasons.includes(reason)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedReasons(prev => [...prev, reason]);
                          else setSelectedReasons(prev => prev.filter(r => r !== reason));
                        }}
                      />
                      <span className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-700">{reason}</span>
                    </label>
                  ))}
               </div>
               <div className="space-y-1.5">
                 <span className="text-[10px] font-bold text-slate-500 px-1">ملاحظات إضافية يدوية (اختياري):</span>
                 <textarea 
                   placeholder="اكتب ملاحظات إضافية هنا في حال عدم وجودها بالأعلى..."
                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs min-h-[60px] focus:ring-2 focus:ring-indigo-500 outline-none"
                   value={selectedApp?.notes || ""}
                   onChange={(e) => {
                     if (!selectedApp) return;
                     setSelectedApp({ ...selectedApp, notes: e.target.value });
                   }}
                 />
               </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
               <Button variant="default" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold h-11" onClick={() => updateStatus('ACCEPTED')}>
                 <Check size={14} className="ml-2" /> قبول مبدئي
               </Button>
               <Button variant="outline" className="flex-1 text-xs font-bold h-11 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => updateStatus('REVISION_REQUESTED')}>
                 <RefreshCw size={14} className="ml-2" /> طلب تعديل البيانات
               </Button>
               <Button variant="outline" className="flex-1 text-xs font-bold h-11 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => updateStatus('INCOMPLETE')}>
                 <AlertTriangle size={14} className="ml-2" /> طلب استكمال نواقص
               </Button>
               <Button variant="destructive" className="flex-1 text-xs font-bold h-11" onClick={() => updateStatus('REJECTED')}>
                 <X size={14} className="ml-2" /> رفض الطلب نهائياً
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Window */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-0 border-none bg-transparent shadow-none" dir="rtl">
          <div className="relative group">
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 -left-12 p-3 text-white hover:text-red-400 transition-colors z-50 bg-slate-900/50 rounded-full"
            >
              <X size={24} />
            </button>
            <div className="bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-slate-900">
                <span className="text-[10px] font-bold text-slate-300">{previewImage?.name}</span>
                <a 
                  href={previewImage?.url} 
                  download={`${previewImage?.name}.png`}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 px-2 py-1 rounded"
                >
                  <Download size={14} /> حفظ الصورة
                </a>
              </div>
              <img 
                src={previewImage?.url} 
                className="w-full h-auto max-h-[75vh] object-contain block" 
                alt="معاينة" 
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
