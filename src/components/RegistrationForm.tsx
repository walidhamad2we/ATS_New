/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { storage } from "../lib/storage";
import { toast } from "sonner";
import { motion } from "motion/react";
import { 
  Upload, 
  CheckCircle2, 
  User, 
  MapPin, 
  Calendar, 
  CreditCard, 
  Phone, 
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Check,
  Paperclip,
  Trash2,
  Mail,
  ShieldCheck,
  Grid
} from "lucide-react";
import { getAccessToken } from "../lib/googleAuth";
import { findFolderByName, createFolder, uploadFileToDrive, appendSpreadsheetRow } from "../lib/googleDriveSheets";
import { StudentApplication } from "../types";
import { compressImage } from "../lib/utils";

interface RegistrationFormProps {
  initialApplication?: StudentApplication | null;
}

export default function RegistrationForm({ initialApplication }: RegistrationFormProps) {
  const [step, setStep] = useState(1);
  const [regNumber, setRegNumber] = useState<string | null>(initialApplication?.registrationNumber || null);
  const settings = storage.getSettings();

  // Dynamic values store for all fields in the active form template
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    if (initialApplication) {
      const data: Record<string, any> = { ...initialApplication.customData };
      // Map system fields back to their IDs in formData
      data['fullName'] = initialApplication.fullName;
      data['province'] = initialApplication.province;
      data['dob'] = initialApplication.dob;
      data['nationalId'] = initialApplication.nationalId;
      data['score'] = initialApplication.score;
      data['fatherName'] = initialApplication.fatherName;
      data['fatherJob'] = initialApplication.fatherJob;
      data['motherName'] = initialApplication.motherName;
      data['motherJob'] = initialApplication.motherJob;
      data['phone'] = initialApplication.phone;
      
      // Handle documents (if they are still base64)
      if (initialApplication.documents) {
        if (initialApplication.documents.personalPhoto?.startsWith('data:')) {
          data['personalPhoto'] = { name: 'المرفق السابق', dataUrl: initialApplication.documents.personalPhoto };
        }
        if (initialApplication.documents.birthCertificate?.startsWith('data:')) {
          data['birthCertificate'] = { name: 'المرفق السابق', dataUrl: initialApplication.documents.birthCertificate };
        }
        if (initialApplication.documents.prepCertificate?.startsWith('data:')) {
          data['prepCertificate'] = { name: 'المرفق السابق', dataUrl: initialApplication.documents.prepCertificate };
        }
        if (initialApplication.documents.parentNationalId?.startsWith('data:')) {
          data['parentNationalId'] = { name: 'المرفق السابق', dataUrl: initialApplication.documents.parentNationalId };
        }
      }
      return data;
    }
    return {};
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);

  const activeFields = storage.getActiveFormFields();
  const activeFormName = storage.getActiveFormName();

  // Handle local file uploads (Base64 conversion with file properties)
  const handleFileUpload = (fieldId: string, file: File) => {
    if (!file) return;

    // Limit to 10MB to prevent browser memory/fetch issues
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`حجم الملف "${file.name}" كبير جداً، الحد الأقصى هو 10 ميجابايت`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({
        ...prev,
        [fieldId]: {
          name: file.name,
          size: (file.size / 1024).toFixed(1) + " KB",
          type: file.type,
          dataUrl: reader.result as string
        }
      }));
      setErrors(prev => ({ ...prev, [fieldId]: "" }));
      toast.success(`تم إدراج الملف "${file.name}" بنجاح`);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent, fieldId: string) => {
    e.preventDefault();
    setDraggingFieldId(fieldId);
  };

  const handleDragLeave = () => {
    setDraggingFieldId(null);
  };

  const handleDrop = (e: React.DragEvent, fieldId: string) => {
    e.preventDefault();
    setDraggingFieldId(null);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(fieldId, files[0]);
    }
  };

  const clearFile = (fieldId: string) => {
    setFormData(prev => {
      const updated = { ...prev };
      delete updated[fieldId];
      return updated;
    });
    toast.info("تم إزالة الملف المرفق");
  };

  // Google Forms like comprehensive validation engine
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    activeFields.filter(f => !f.hidden).forEach(field => {
      const value = formData[field.id];
      const isPresent = value !== undefined && value !== null && String(value).trim() !== "";
      const isFilePresent = value && typeof value === 'object' && value.dataUrl;

      // 1. Is required checked?
      if (field.required) {
        if (field.type === 'file' || field.type === 'image') {
          if (!isFilePresent) {
            newErrors[field.id] = "هذا المرفق الرقمي مطلوب إلزامياً لإتمام التسجيل";
            isValid = false;
          }
        } else {
          if (!isPresent) {
            newErrors[field.id] = "هذا الحلق مطلوب إلزامياً";
            isValid = false;
            return;
          }
        }
      }

      // 2. Perform validations based on check conditions
      if (isPresent && (field.type === 'text' || field.type === 'number')) {
        const strVal = String(value).trim();

        // Arab letters & spaces validation
        if (field.validationType === 'name') {
          const arabicRegex = /^[\u0600-\u06FF\s]+$/;
          if (!arabicRegex.test(strVal)) {
            newErrors[field.id] = "يجب إدخال الحقل باللغة العربية فقط وبحروف صحيحة";
            isValid = false;
          } else if (strVal.split(/\s+/).filter(Boolean).length < 4) {
            newErrors[field.id] = "يرجى كتابة الاسم رباعياً كاملاً لتجنب رفض الطلب";
            isValid = false;
          }
        }

        // Egyptian phone number verification
        if (field.validationType === 'phone') {
          const phoneRegex = /^(010|011|012|015)\d{8}$/;
          if (!phoneRegex.test(strVal)) {
            newErrors[field.id] = "رقم موبايل مصري غير صحيح، يجب أن يتكون من 11 رقماً ويبدأ بـ (010, 011, 012, 015)";
            isValid = false;
          }
        }

        // Egyptian National ID Verification
        if (field.validationType === 'national_id') {
          const nationalIdRegex = /^\d{14}$/;
          if (!nationalIdRegex.test(strVal)) {
            newErrors[field.id] = "الرقم القومي غير صحيح، يجب أن يتكون من 14 رقماً بالكامل";
            isValid = false;
          }
        }

        // Email address formatting verification
        if (field.validationType === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(strVal)) {
            newErrors[field.id] = "صيغة البريد الإلكتروني غير صحيحة، مثال: active@bawabtna.com";
            isValid = false;
          }
        }

        // Numerical limits bound checks
        if (field.type === 'number') {
          const numVal = Number(strVal);
          if (field.minNumber !== undefined && numVal < field.minNumber) {
            newErrors[field.id] = `قيمة الحقل يجب أن تكون أكبر من أو تساوي ${field.minNumber}`;
            isValid = false;
          }
          if (field.maxNumber !== undefined && numVal > field.maxNumber) {
            newErrors[field.id] = `قيمة الحقل يجب ألا تتجاوز ${field.maxNumber}`;
            isValid = false;
          }
        }
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("يرجى مراجعة وتصحيح الحقول الحمراء الشاغرة أو الخاطئة للمتابعة");
      return;
    }

    // Build the dynamic StudentApplication object correctly from dynamic fields values
    const newRegNum = initialApplication?.registrationNumber || Math.floor(100000 + Math.random() * 900000).toString();

    // Map system fields to root properties of the student for compatibility with grades, queries & reviews
    const finalApplication: any = {
      id: initialApplication?.id || crypto.randomUUID(),
      registrationNumber: newRegNum,
      fullName: formData['fullName'] || formData['field_fullName'] || "طالب مجهول",
      province: formData['province'] || "غير محددة",
      dob: formData['dob'] || new Date().toISOString().substring(0, 10),
      nationalId: formData['nationalId'] || "00000000000000",
      score: formData['score'] ? Number(formData['score']) : 0,
      fatherName: formData['fatherName'] || "",
      fatherJob: formData['fatherJob'] || "",
      motherName: formData['motherName'] || "",
      motherJob: formData['motherJob'] || "",
      phone: formData['phone'] || "",
      documents: {
        personalPhoto: formData['personalPhoto']?.dataUrl || (initialApplication?.documents?.personalPhoto || ""),
        birthCertificate: formData['birthCertificate']?.dataUrl || (initialApplication?.documents?.birthCertificate || ""),
        prepCertificate: formData['prepCertificate']?.dataUrl || (initialApplication?.documents?.prepCertificate || ""),
        parentNationalId: formData['parentNationalId']?.dataUrl || (initialApplication?.documents?.parentNationalId || "")
      },
      status: 'pending' as any,
      createdAt: initialApplication?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customData: {}
    };

    // Store all filled-in template properties in customData
    activeFields.forEach(field => {
      finalApplication.customData[field.id] = formData[field.id];
    });

    // Save initial local copy first so we never lose student info
    await storage.saveApplication(finalApplication);

    // ROOT RESOLUTION: Fast Direct-to-Google Cloud Submission (Best Effort)
    toast.promise(
      (async () => {
        let tokenResp = null;
        try {
          tokenResp = await getAccessToken();
        } catch (e) {
          // Ignore token error during submission, we have the server backup now
        }

        if (!tokenResp) {
          // Just returns indicating local success if no token is available for direct sync
          return newRegNum;
        }

        const accessToken = tokenResp;
        const activeTemplate = (settings.formTemplates || []).find(t => t.id === settings.activeFormTemplateId);
        const spreadsheetId = activeTemplate?.spreadsheetId || settings.spreadsheetId;
        if (!activeTemplate || !spreadsheetId) throw new Error("NO_TEMPLATE");

        const updatedDocuments = { ...finalApplication.documents };
        const customDataWithLinks = { ...finalApplication.customData };
        const fileFolderId = activeTemplate.filesFolderId || settings.googleDriveFolderId;

        // 1. Manage Folder Structure
        let studentFolderId = fileFolderId;
        if (fileFolderId) {
          const folderName = `${newRegNum}_${finalApplication.fullName}`;
          try {
            const existingFolderId = await findFolderByName(accessToken, folderName, fileFolderId);
            studentFolderId = existingFolderId || (await createFolder(accessToken, folderName, fileFolderId)).id;
          } catch (e) {
            console.error("Folder management failed, falling back to root:", e);
          }
        }

        // 2. Upload Files with Compression
        const uploadFileTask = async (key: string, name: string, dataUrl: string) => {
          let dataToUpload = dataUrl;
          if (dataUrl.startsWith('data:image/')) {
            try {
              dataToUpload = await compressImage(dataUrl, 1200, 0.6); // Aggressive compression for speed
            } catch (e) {
              console.warn("Compression failed for", key);
            }
          }
          return uploadFileToDrive(accessToken, studentFolderId!, name, dataToUpload);
        };

        const uploadPromises: Promise<void>[] = [];

        // System Docs
        const systemDocs = [
          { key: 'personalPhoto', name: 'photo' },
          { key: 'birthCertificate', name: 'birth' },
          { key: 'prepCertificate', name: 'prep' },
          { key: 'parentNationalId', name: 'parent_id' }
        ];

        for (const doc of systemDocs) {
          const fileObj = formData[doc.key];
          if (fileObj?.dataUrl) {
            uploadPromises.push(
              uploadFileTask(doc.key, `${doc.name}_${newRegNum}_${fileObj.name}`, fileObj.dataUrl)
                .then(url => { (updatedDocuments as any)[doc.key] = url; })
            );
          }
        }

        // Custom Fields
        for (const f of activeFields) {
          if (systemDocs.some(sd => sd.key === f.id)) continue;
          const fileObj = formData[f.id];
          if (fileObj?.dataUrl) {
            uploadPromises.push(
              uploadFileTask(f.id, `${f.id}_${newRegNum}_${fileObj.name}`, fileObj.dataUrl)
                .then(url => { customDataWithLinks[f.id] = url; })
            );
          }
        }

        // Wait for all uploads (Parallel)
        await Promise.all(uploadPromises);

        // 3. Build Row & Append to Sheet
        const rowValues = [
          finalApplication.registrationNumber,
          finalApplication.fullName,
          finalApplication.province,
          finalApplication.dob,
          finalApplication.nationalId,
          finalApplication.score,
          finalApplication.fatherName,
          finalApplication.fatherJob,
          finalApplication.motherName,
          finalApplication.motherJob,
          finalApplication.phone,
          new Date().toISOString(),
          "قيد المراجعة"
        ];

        (activeTemplate.formFields || []).filter(field => !field.system).forEach(field => {
          rowValues.push(String(customDataWithLinks[field.id] || ""));
        });

        await appendSpreadsheetRow(accessToken, spreadsheetId, rowValues);

        // Update local storage with cloud links
        await storage.saveApplication({
          ...finalApplication,
          documents: updatedDocuments,
          customData: customDataWithLinks,
          cloudSynced: true
        });

        return newRegNum;
      })(),
      {
        loading: "جاري تأمين اتصال سحابي مباشر مع Google Drive ورفع المستندات...",
        success: "تم إرسال طلبك بنجاح وحفظ كافة المستندات في سجلات المدرسة!",
        error: (err) => {
          console.error("Submission failed:", err);
          if (err.message === "UNAUTHENTICATED") return "خطأ في الصلاحيات: يرجى التواصل مع الإدارة لتجديد مفتاح الوصول.";
          return "حدث خطأ أثناء الرفع السحابي، ولكن تم حفظ الطلب مؤقتاً على جهازك.";
        }
      }
    );

    setRegNumber(newRegNum);
    setStep(2); // Success view screen
  };

  if (!settings.registrationOpen) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="max-w-2xl mx-auto mt-10 text-center border-red-100 bg-red-50/30 shadow-sm rounded-xl">
          <CardHeader className="py-12">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
               <AlertTriangle size={32} />
            </div>
            <CardTitle className="text-xl font-bold text-red-900">نعتذر، التسجيل بالمدرسة مغلق حالياً</CardTitle>
            <CardDescription className="text-red-750/70 max-w-sm mx-auto mt-2 leading-relaxed text-xs">لقد تم الانتهاء من فحص وتلقي طلبات المتقدمين للمرحلة السحابية الحالية. ترقبوا الإعلان عن مراحل التقديم ونتائج القبول الجديدة قريباً.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center pb-8">
             <Button variant="outline" className="border-red-200 text-red-700 h-9 px-6 font-bold" onClick={() => window.location.reload()}>العودة للرئيسية</Button>
          </CardFooter>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500 py-2 text-right" dir="rtl">
      {/* Back Button */}
      <div className="flex justify-start mb-1.5">
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 h-6 px-2">
          &larr; العودة لبوابة القبول الرئيسية
        </Button>
      </div>

      {/* Dynamic Header Badge mirroring active template details */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100/75 rounded-xl p-3 mb-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
        <div className="space-y-0.5">
          <span className="text-[8px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider border border-blue-200 shadow-xs">الاستمارة النشطة المعتمدة للبوابة</span>
          <h2 className="text-sm font-black text-slate-900 mt-1 flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-blue-600" />
            {activeFormName}
          </h2>
          <p className="text-[9px] text-slate-500 font-medium leading-relaxed">الرجاء إدخال كامل البيانات الشخصية والأكاديمية، وتحميل المرفقات المطلوبة بدقة لتفادي حفظ الملف كناقص.</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200/50 px-2 py-1 rounded-lg font-mono text-[8px] text-slate-500 shadow-xs shrink-0">
          <Grid size={10} className="text-indigo-500" />
          <span>تكامل حقول النظام v2.4</span>
        </div>
      </div>

      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <form onSubmit={onSubmit} className="space-y-3">
            
            {/* Structured dynamically built card containing active questions block */}
            <Card className="shadow-md shadow-slate-200/50 border-slate-200 overflow-hidden rounded-xl bg-white">
              <CardHeader className="py-3 px-5 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <User size={18} className="text-indigo-600" />
                  <CardTitle className="text-sm md:text-base font-black text-slate-850 tracking-tight">استمارات ملء طلب الالتحاق والوثائق</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-5.5 space-y-3">
                
                {/* Dynamically Loop through fields in their respective design layout order */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5">
                  {activeFields.filter(f => !f.hidden).map((field) => {
                    const hasError = !!errors[field.id];
                    const inputId = `form-field-${field.id}`;
                    
                    // Render input fields appropriately based on configuration template
                    return (
                      <div 
                        key={field.id} 
                        className={`space-y-1 ${field.type === 'file' || field.type === 'image' ? 'bg-slate-50/40 p-2.5 rounded-lg border border-slate-100' : ''}`}
                      >
                        <Label htmlFor={inputId} className="text-xs md:text-[13px] font-black text-slate-700 flex items-center gap-0.5">
                          {field.label} {field.required && <span className="text-red-500 text-xs font-bold">*</span>}
                        </Label>

                        {/* Dropdown Options render state */}
                        {field.type === 'select' ? (
                           <Select
                            value={formData[field.id] || ""}
                            onValueChange={(val) => {
                              setFormData(prev => ({ ...prev, [field.id]: val }));
                              setErrors(prev => ({ ...prev, [field.id]: "" }));
                            }}
                          >
                            <SelectTrigger id={inputId} className="text-xs md:text-[13.5px] h-9 md:h-10 border-slate-200 rounded-md bg-white w-full">
                              <SelectValue placeholder="فهرس الاختيارات المسموحة..." />
                            </SelectTrigger>
                            <SelectContent className="bg-white text-right" dir="rtl">
                              {field.options && field.options.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs md:text-[13px] text-right">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.type === 'file' || field.type === 'image' ? (
                          /* Enhanced Drag-and-drop & Click to Upload specialized UI */
                          <div className="space-y-1.5">
                            <div
                              onDragOver={(e) => handleDragOver(e, field.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, field.id)}
                              className={`border shadow-xs border-dashed rounded-md p-2.5 md:p-4 flex flex-col items-center justify-center transition-all cursor-pointer relative group ${
                                draggingFieldId === field.id
                                  ? "border-indigo-600 bg-indigo-50/50 scale-[1.01]"
                                  : formData[field.id]
                                  ? "border-emerald-500 bg-emerald-50/10"
                                  : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50 bg-white"
                              }`}
                              onClick={() => document.getElementById(inputId)?.click()}
                            >
                              <input 
                                type="file"
                                id={inputId}
                                accept={field.type === 'image' ? "image/*" : "*/*"}
                                className="hidden"
                                onChange={(e) => {
                                  const files = e.target.files;
                                  if (files && files.length > 0) {
                                    handleFileUpload(field.id, files[0]);
                                  }
                                }}
                              />
                              
                              <div className="relative z-10 flex flex-col items-center text-center space-y-1 md:space-y-1.5">
                                <div className={`p-1.5 rounded-full transition-colors ${
                                  formData[field.id] ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                                }`}>
                                  {field.type === 'image' ? (
                                    <ImageIcon className="w-4 h-4 md:w-5 md:h-5" />
                                  ) : (
                                    <Upload className="w-4 h-4 md:w-5 md:h-5" />
                                  )}
                                </div>
                                
                                <div className="space-y-0.5 md:space-y-1">
                                  <p className="text-xs md:text-[13px] font-black text-slate-800">
                                    {field.type === 'image' ? "اسحب وأسقط الصورة هنا أو اضغط للاستعراض" : "اسحب وأسقط الملف المطلوب هنا أو اضغط للاستعراض"}
                                  </p>
                                  <p className="text-[10px] md:text-[11px] text-slate-400 font-semibold leading-none">
                                    يدعم صيغ الصور، PDF، والمستندات (بحد أقصى 10 ميجابايت)
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* File Preview and Status Card */}
                            {formData[field.id] && (
                              <div className="bg-white border border-emerald-100 rounded-lg p-2.5 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2">
                                  {field.type === 'image' && formData[field.id].dataUrl ? (
                                    <img 
                                      src={formData[field.id].dataUrl} 
                                      alt="معاينة" 
                                      className="w-10 h-10 rounded-md object-cover border border-slate-200 shadow-xs"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
                                      <Check size={16} />
                                    </div>
                                  )}
                                  <div className="overflow-hidden">
                                    <p className="text-xs font-black text-slate-700 truncate max-w-[180px]">{formData[field.id].name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">جاهز للرفع</span>
                                      <span className="text-[10px] text-slate-400 font-mono font-bold">{formData[field.id].size}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  type="button"
                                  className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearFile(field.id);
                                  }}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Text, Date and Number generic inputs */
                          <Input 
                            id={inputId}
                            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                            className={`text-xs md:text-[13.5px] h-9 md:h-10 border-slate-200 rounded-md bg-white ${hasError ? 'border-red-400 ring-1 ring-red-150' : 'focus:ring-2 focus:ring-indigo-500'}`}
                            value={formData[field.id] !== undefined ? formData[field.id] : ""}
                            onChange={(e) => {
                              setFormData(prev => ({ ...prev, [field.id]: e.target.value }));
                              setErrors(prev => ({ ...prev, [field.id]: "" }));
                            }}
                            placeholder={field.type === 'number' ? "0" : `يرجى كتابة ${field.label}...`}
                          />
                        )}

                        {hasError && <p className="text-red-500 text-[8px] font-bold mt-0.5 animate-pulse flex items-center gap-0.5">
                          <AlertTriangle size={9} /> {errors[field.id]}
                        </p>}
                      </div>
                    );
                  })}
                </div>

              </CardContent>
              <CardFooter className="flex justify-end p-3 bg-slate-50 border-t border-slate-100">
                <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white font-black h-8 px-6 text-[10.5px] rounded transition-all">
                  اعتماد الملف وإرسال طلب الالتحاق
                </Button>
              </CardFooter>
            </Card>

          </form>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="text-center py-10 relative overflow-hidden max-w-2xl mx-auto shadow-xl rounded-2xl bg-white border border-slate-100">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 shadow-md"></div>
            <CardHeader className="py-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-emerald-100 animate-bounce">
                <CheckCircle2 size={36} />
              </div>
              <CardTitle className="text-xl font-black text-slate-900 tracking-tight">تم استقبال طلبك بنجاح وسرور!</CardTitle>
              <CardDescription className="text-xs font-semibold text-slate-400 mt-1">يرجى تسجيل الكود الرقمي أدناه لمتابعة طلبك والتعرف على مواعيد الاختبارات</CardDescription>
            </CardHeader>
            <CardContent className="py-6">
              <div className="bg-slate-950 px-8 py-5 rounded-2xl inline-block border-2 border-slate-800 shadow-2xl relative">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 font-mono">EXAM_ACCESS_KEY</p>
                <span className="text-3xl font-mono font-black tracking-[0.25em] text-white select-all">{regNumber}</span>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 max-w-xs mx-auto pb-6">
              <p className="text-[11px] text-slate-400 font-bold leading-relaxed italic">سيُطلب منك هذا الرمز بشكل دائم لمتابعة القرار النهائي من لجنة المراجعة أو خوض الاختبار.</p>
              <Button className="w-full h-10 font-black text-xs bg-slate-900 hover:bg-slate-800 rounded-xl" onClick={() => window.location.reload()}>
                العودة للبوابة الرئيسية
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
