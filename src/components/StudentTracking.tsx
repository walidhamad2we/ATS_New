/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { storage } from "../lib/storage";
import { StudentApplication } from "../types";
import { Search, LogIn, Clock, Calendar, CheckCircle, XCircle, AlertCircle, Edit3 } from "lucide-react";
import { motion } from "motion/react";

interface StudentTrackingProps {
  onEditApplication?: (app: StudentApplication) => void;
}

export default function StudentTracking({ onEditApplication }: StudentTrackingProps) {
  const [regNum, setRegNum] = useState("");
  const [application, setApplication] = useState<StudentApplication | null>(null);
  const [error, setError] = useState("");

  const handleLogin = () => {
    const apps = storage.getApplications();
    const found = apps.find((a) => a.registrationNumber === regNum);
    if (found) {
      setApplication(found);
      setError("");
    } else {
      setError("رقم التسجيل غير صحيح");
      setApplication(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING": return <Badge className="bg-slate-50 text-slate-600 border-slate-100 text-[10px] font-bold h-5" variant="outline"><Clock size={10} className="ml-1"/> قيد المراجعة</Badge>;
      case "ACCEPTED": return <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[10px] font-bold h-5" variant="outline"><CheckCircle size={10} className="ml-1"/> تم القبول مبدئياً</Badge>;
      case "REJECTED": return <Badge className="bg-red-50 text-red-600 border-red-100 text-[10px] font-bold h-5" variant="outline"><XCircle size={10} className="ml-1"/> مرفوض نهائياً</Badge>;
      case "REVISION_REQUESTED": return <Badge className="bg-amber-50 text-amber-600 border-amber-100 text-[10px] font-bold h-5" variant="outline"><AlertCircle size={10} className="ml-1"/> مطلوب تعديل البيانات</Badge>;
      case "INCOMPLETE": return <Badge className="bg-blue-50 text-blue-600 border-blue-100 text-[10px] font-bold h-5" variant="outline"><AlertCircle size={10} className="ml-1"/> استكمال مستندات</Badge>;
      default: return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-500 py-6" dir="rtl">
      <div className="flex justify-start mb-6">
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()} className="text-[10px] font-bold text-slate-400">
          &larr; العودة للرئيسية
        </Button>
      </div>
      {!application ? (
        <Card className="high-density-card">
          <CardHeader className="py-8 border-b border-slate-100 bg-slate-50/50">
            <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
               <LogIn className="text-blue-600" size={20} />
            </div>
            <CardTitle className="text-lg font-bold text-slate-900 text-center tracking-tight">
              بوابة متابعة الطلبات
            </CardTitle>
            <CardDescription className="text-center text-[10px] uppercase font-bold text-slate-400 tracking-widest">أدخل كود الوصول للمتابعة</CardDescription>
          </CardHeader>
          <CardContent className="py-10 space-y-6">
            <div className="space-y-3">
              <Label className="text-xs font-bold text-center block text-slate-500">كود التسجيل المكون من ٦ أرقام</Label>
              <Input 
                value={regNum} 
                onChange={(e) => setRegNum(e.target.value)} 
                placeholder="0 0 0 0 0 0" 
                className="text-center text-4xl tracking-[0.5em] font-mono h-16 bg-slate-50 border-slate-200 focus:bg-white transition-all shadow-inner"
              />
              {error && <p className="text-red-500 text-[10px] font-bold text-center bg-red-50 py-1 rounded">{error}</p>}
            </div>
          </CardContent>
          <CardFooter className="pb-8">
            <Button onClick={handleLogin} className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-bold text-xs shadow-lg shadow-blue-500/20">
               تحقق من حالة القبول &larr;
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="high-density-card overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-900 text-white py-8 relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 blur-3xl rounded-full"></div>
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">ملف الطالب الرقمي</span>
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
                  </div>
                  <CardTitle className="text-xl font-bold tracking-tight">{application.fullName}</CardTitle>
                  <CardDescription className="text-slate-500 font-mono text-[10px] mt-1">ID: #{application.registrationNumber}</CardDescription>
                </div>
                {getStatusBadge(application.status)}
              </div>
            </CardHeader>

            <CardContent className="py-8 space-y-8 bg-white">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 shadow-sm transition-transform hover:scale-[1.02]">
                  <p className="text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-widest">المرحلة الحالية</p>
                  <p className="text-xs font-bold text-slate-700">
                    {application.status === 'ACCEPTED' ? 'تم اعتماد الملف والموافقة مبدئياً' : 
                     application.status === 'REVISION_REQUESTED' ? 'يتطلب إعادة مراجعة وتعديل بيانات من قبلك' :
                     application.status === 'REJECTED' ? 'تم الرفض النهائي لعدم استيفاء الشروط' :
                     application.status === 'INCOMPLETE' ? 'يتطلب إجراء فوري برفع المستندات الناقصة' : 
                     'جاري تدقيق البيانات من اللجنة المختصة'}
                  </p>
                  {application.notes && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-[10px] text-red-500 font-bold mb-1">ملاحظة اللجنة:</p>
                      <p className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-100">{application.notes}</p>
                    </div>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-blue-600 text-white shadow-xl shadow-blue-600/20 transition-transform hover:scale-[1.02] relative overflow-hidden group">
                   <div className="absolute -bottom-2 -left-2 text-white/5 transform -rotate-12 group-hover:scale-110 transition-transform">
                      <Calendar size={64} />
                   </div>
                   <p className="text-[10px] text-blue-200 mb-1 font-bold uppercase tracking-widest relative z-10">موعد المقابلة / الاختبار</p>
                   <p className="text-sm font-black flex items-center gap-2 relative z-10">
                      <Calendar size={14} />
                      {application.examDate || 'قيد الجدولة...'}
                   </p>
                </div>
              </div>

              {application.notes && (
                <div className="p-5 rounded-xl bg-amber-50 border border-amber-100 relative shadow-sm">
                  <div className="absolute top-0 right-0 w-1 h-full bg-amber-400"></div>
                  <p className="text-[10px] text-amber-700 mb-2 font-black uppercase tracking-widest flex items-center gap-2">
                     <AlertCircle size={10} /> تنبيه من اللجنة الإدارية
                  </p>
                  <p className="text-xs text-amber-900 leading-relaxed font-bold">{application.notes}</p>
                </div>
              )}

              {(application.status === 'REVISION_REQUESTED' || application.status === 'INCOMPLETE') && onEditApplication && (
                <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-4">
                  <div className="text-center space-y-1">
                    <p className="text-xs font-bold text-indigo-900">لديك فرصة لتعديل بياناتك ورفع المرفقات الصحيحة الآن</p>
                    <p className="text-[10px] text-slate-500">سيتم إعادة مراجعة طلبك فور حفظ التعديلات</p>
                  </div>
                  <Button 
                    onClick={() => onEditApplication(application)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-11 shadow-lg shadow-indigo-200"
                  >
                    <Edit3 size={14} className="ml-2" /> تعديل بيانات الاستمارة وإعادة الإرسال
                  </Button>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-3">
                  <span className="w-8 h-px bg-slate-200"></span> 
                  بيانات التسجيل المؤرشفة
                  <span className="flex-1 h-px bg-slate-200"></span>
                </h4>
                
                <div className="grid grid-cols-2 gap-y-4 text-xs">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">الإقليم الجغرافي</p>
                    <p className="font-extrabold text-slate-900">{application.province}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">تاريخ الاستحقاق</p>
                    <p className="font-extrabold text-slate-900">{application.dob}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">المجموع الكلي</p>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-black">
                       {application.score} 
                       <span className="text-[8px] opacity-70">درجة</span>
                    </div>
                  </div>
                   <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">توقيت التقديم</p>
                    <p className="font-mono text-[10px] text-slate-600">{new Date(application.createdAt).toLocaleDateString('ar-EG')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="bg-slate-50 py-4 border-t border-slate-100 flex justify-between px-6">
               <p className="text-[8px] text-slate-400 font-bold max-w-[200px]">تم إصدار البيانات الكترونياً ولا تحتاج لختم رسمي للمتابعة الأولية.</p>
               <Button variant="ghost" size="sm" onClick={() => setApplication(null)} className="h-8 text-[10px] font-bold text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors">
                 إنهاء الجلسة الآمنة
               </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
