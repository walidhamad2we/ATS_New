/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { storage } from "../lib/storage";
import { StudentApplication, ExamSubmission, Exam } from "../types";
import { 
  Bell, 
  ShieldCheck, 
  UserCheck, 
  Calendar, 
  FileText, 
  ArrowLeft, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  LogIn, 
  Lock, 
  Info, 
  Download, 
  Phone, 
  HelpCircle,
  MessageSquare,
  ChevronLeft,
  X,
  FileSpreadsheet,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

interface ParentPortalProps {
  onBackToHome: () => void;
  onEditApplication?: (app: StudentApplication) => void;
}

interface Inquiry {
  id: string;
  sender: 'PARENT' | 'ADMIN';
  message: string;
  timestamp: string;
}

export default function ParentPortal({ onBackToHome, onEditApplication }: ParentPortalProps) {
  const [loginStep, setLoginStep] = useState<'LOGIN' | 'PORTAL'>('LOGIN');
  const [regNum, setRegNum] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [currentApp, setCurrentApp] = useState<StudentApplication | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<'STATUS' | 'NOTIFICATIONS' | 'HELP'>('STATUS');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [examSubmissions, setExamSubmissions] = useState<ExamSubmission[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);

  // Check login session on load
  useEffect(() => {
    const session = localStorage.getItem('parent_portal_session');
    if (session) {
      const { regNum: savedRegNum, nationalId: savedNID } = JSON.parse(session);
      storage.init().then(() => {
        const apps = storage.getApplications();
        const found = apps.find(a => 
          (String(a.registrationNumber) === String(savedRegNum) || a.id === savedRegNum) && 
          (a.nationalId === savedNID || a.id === savedRegNum)
        );
        if (found) {
          setCurrentApp(found);
          setLoginStep('PORTAL');
          setExamSubmissions(storage.getSubmissions().filter(s => s.studentId === found.id || s.studentId === found.registrationNumber));
          setExams(storage.getExams());
          loadInquiriesAndNotifications(found);
        } else {
          localStorage.removeItem('parent_portal_session');
        }
      });
    }
  }, []);

  const calculateGrandTotal = () => {
    if (!currentApp) return 0;
    const prepScore = Number(currentApp.score) || 0;
    const examsTotal = examSubmissions.reduce((acc, sub) => acc + (sub.totalGrade || 0), 0);
    return prepScore + examsTotal;
  };

  const loadInquiriesAndNotifications = (app: StudentApplication) => {
    // Load custom parent questions/inquiries
    if (app.customData && app.customData.parentInquiries) {
      setInquiries(app.customData.parentInquiries);
    } else {
      setInquiries([
        {
          id: 'welcome',
          sender: 'ADMIN',
          message: 'مرحباً بولي الأمر في بوابة المتابعة الذكية. يمكنك استخدام هذا الصندوق لإرسال أي استفسار إلى إدارة القبول والمراجعة.',
          timestamp: new Date(app.createdAt).toISOString()
        }
      ]);
    }

    // Dynamic state-based notification builder
    const customNotifications = [
      {
        id: 'global-1',
        title: 'ضوابط حضور مرحلة المقابلات الشخصية والاختبارات',
        content: 'تنبيه لجميع السادة أولياء أمور الطلاب: يجب حضور الطالب في الموعد المحدد مرتدياً اللباس اللائق ومعه نسخة مطبوعة من بطاقة الترشيح وصورة من الملف التقني المتكامل.',
        date: 'أمس',
        icon: <Info className="text-blue-500" size={16} />,
        unread: true
      }
    ];

    if (app.status === 'PENDING') {
      customNotifications.unshift({
        id: 'status-notif',
        title: 'طلب الالتحاق قيد المراجعة والتدقيق',
        content: `تم استلام ملف الطالب (${app.fullName}) عبر بوابة القبول. الطلب يخضع حالياً لمطابقة الشروط والتحقق الإداري من الأوراق الرسمية المرفقة (الشهادة الإعدادية، الرقم القومي، والصورة الشخصية).`,
        date: 'منذ قليل',
        icon: <Clock className="text-amber-500 animate-pulse" size={16} />,
        unread: true
      });
    } else if (app.status === 'ACCEPTED') {
      customNotifications.unshift({
        id: 'status-notif',
        title: 'مبروك! قبول مبدئي وتحديد موعد الاختبار',
        content: `تم مراجعة وقبول ملف الطالب (${app.fullName}) مبدئياً. تم حجز موعد المقابلة والاختبار الأكاديمي والمهني المؤهل. نرجو مراجعة قسم الموعد وبطاقة الترشيح فوراً ودفع الرسوم المقررة.`,
        date: 'اليوم',
        icon: <CheckCircle2 className="text-emerald-500" size={16} />,
        unread: true
      });
    } else if (app.status === 'REVISION_REQUESTED') {
      customNotifications.unshift({
        id: 'status-notif',
        title: 'مطلوب فورياً: مراجعة وتعديل بيانات الاستمارة',
        content: `تنوه اللجنة بوجود ملاحظات تتطلب التدخل السريع وإعادة تحرير الحقول غير المتوافقة قبل إغلاق باب التقديم الموحد لضمان الاستمرارية. الملاحظة: "${app.notes || 'بيانات ناقصة أو غير دقيقة'}"`,
        date: 'منذ ساعتين',
        icon: <AlertCircle className="text-red-500 animate-bounce" size={16} />,
        unread: true
      });
    } else if (app.status === 'INCOMPLETE') {
      customNotifications.unshift({
        id: 'status-notif',
        title: 'مرفقات ناقصة: يرجى استكمال المستندات',
        content: `ملف المرفقات الرسمي لنجلكم يفتقر لبعض الصور الداعمة الضرورية للمطابقة (صورة الرقم القومي لولي الأمر أو شهادة الإعدادية). يرجى الرفع مجدداً لتلافي استبعاد الملف تلقائياً. الملاحظة: "${app.notes || 'أعد إرفاق الأوراق'}"`,
        date: 'اليوم',
        icon: <AlertCircle className="text-amber-500" size={16} />,
        unread: true
      });
    }

    setNotifications(customNotifications);
  };

  const handleParentLogin = () => {
    if (!regNum.trim() || !nationalId.trim()) {
      toast.error("يرجى إدخال كود التسجيل والرقم القومي معاً");
      return;
    }

    const apps = storage.getApplications();
    const found = apps.find(
      (a) => (String(a.registrationNumber) === regNum.trim() || a.id === regNum.trim()) && a.nationalId === nationalId.trim()
    );

    if (found) {
      setCurrentApp(found);
      setLoginStep('PORTAL');
      localStorage.setItem('parent_portal_session', JSON.stringify({ regNum: regNum.trim(), nationalId: nationalId.trim() }));
      loadInquiriesAndNotifications(found);
      toast.success(`أهلاً بك يا ولي أمر الطالب: ${found.fullName}`);
    } else {
      toast.error("بيانات الدخول غير متطابقة، يرجى التحقق من الكود والرقم القومي للطالب");
    }
  };

  const handleSendInquiry = async () => {
    if (!newMessage.trim() || !currentApp) return;

    const newInquiry: Inquiry = {
      id: crypto.randomUUID(),
      sender: 'PARENT',
      message: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    const updatedInquiries = [...inquiries, newInquiry];
    setInquiries(updatedInquiries);

    // Save back to application storage
    const updatedApp: StudentApplication = {
      ...currentApp,
      customData: {
        ...currentApp.customData,
        parentInquiries: updatedInquiries
      }
    };

    setCurrentApp(updatedApp);
    await storage.saveApplication(updatedApp);
    setNewMessage("");
    toast.success("تم إرسال استفسارك بنجاح إلى اللجنة المشرفة");
  };

  const handleLogout = () => {
    localStorage.removeItem('parent_portal_session');
    setCurrentApp(null);
    setRegNum("");
    setNationalId("");
    setLoginStep('LOGIN');
    toast.info("تم تسجيل خروج ولي الأمر بنجاح");
  };

  const downloadAdmissionCard = () => {
    if (!currentApp) return;
    toast.success("جاري تجهيز وتحميل بطاقة الترشيح وباقة حضور الاختبارات الرسمية...");
    
    // Create custom printable sheet simulating admission pass download
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("يرجى السماح بالنوافذ المنبثقة للطباعة");
      return;
    }
    
    win.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>بطاقة مراجعة واختبار - بوابة القبول الذكية</title>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Cairo', sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b; }
            .card { width: 100%; max-width: 650px; margin: 30px auto; background: white; border: 2px solid #e2e8f0; border-radius: 20px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background: #312e81; color: white; padding: 30px; text-align: center; }
            .body { padding: 40px; }
            .title { font-size: 24px; font-weight: 900; margin: 0 0 5px 0; }
            .subtitle { font-size: 14px; opacity: 0.8; margin: 0; text-transform: uppercase; }
            .info-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-top: 20px; }
            .info-item { background: #f1f5f9; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .info-label { font-size: 11px; color: #64748b; font-weight: bold; margin-bottom: 5px; }
            .info-value { font-size: 14px; font-weight: bold; color: #0f172a; }
            .badge { display: inline-block; background: #d1fae5; color: #065f46; padding: 5px 12px; font-size: 12px; border-radius: 9999px; font-weight: bold; }
            .instructions { margin-top: 30px; background: #fffbeb; border: 1px solid #fef3c7; padding: 20px; border-radius: 12px; }
            .instructions h4 { margin: 0 0 10px 0; color: #92400e; font-size: 14px; font-weight: 900; }
            .instructions ul { margin: 0; padding-right: 20px; font-size: 12px; line-height: 1.8; color: #78350f; }
            .footer { border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 10px; color: #94a3b8; }
            @media print {
              body { background: white; padding: 0; }
              .card { box-shadow: none; border: 1px solid #000; margin: 0; max-width: 100%; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: center; margin-bottom: 20px;">
            <button onclick="window.print()" style="background: #312e81; color: white; border: none; padding: 10px 25px; border-radius: 8px; font-family: 'Cairo'; cursor: pointer; font-weight: bold; font-size: 14px;">طباعة المستند الرسمي 🖨️</button>
          </div>
          <div class="card">
            <div class="header">
              <h2 class="title">مدارس التكنولوجيا التطبيقية الحديثة</h2>
              <p class="subtitle">بطاقة الترشيح ودخول المقابلة الشخصية الرسمية</p>
            </div>
            <div class="body">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px;">
                <div>
                  <span class="info-label">حالة الترشيح الحالية</span><br/>
                  <span class="badge">مقبول مبدئياً ومؤهل للاختبار</span>
                </div>
                <div style="text-align: left;">
                  <span class="info-label">رقم التسجيل الموحد</span><br/>
                  <strong style="font-size: 18px; color: #4f46e5; font-family: monospace;">#${currentApp.registrationNumber}</strong>
                </div>
              </div>
              
              <div class="info-grid">
                <div class="info-item">
                  <div class="info-label">اسم الطالب رباعي</div>
                  <div class="info-value">${currentApp.fullName}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">المحافظة الإدارية</div>
                  <div class="info-value">${currentApp.province}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">الرقم القومي للطالب</div>
                  <div class="info-value" style="font-family: monospace;">${currentApp.nationalId}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">الموعد والتاريخ الرسمي للاختبار</div>
                  <div class="info-value">${currentApp.examDate || 'الأحد المقبل الساعة ٠٩:٠٠ صباحاً بمقر المدرسة'}</div>
                </div>
              </div>

              <div class="instructions">
                <h4>تعليمات الحضور الهامة لولي الأمر والطالب:</h4>
                <ul>
                  <li>الحضور بمقر المدرسة قبل الموعد بنصف ساعة على الأقل.</li>
                  <li>تقديم أصل الرقم القومي للطالب وبطاقة الترشيح هذه للمطابقة الأمنية عند البوابة.</li>
                  <li>ضرورة مرافقة أحد الوالدين (الأب أو الأم) لتقديم المستندات والتحاور مع لجنة التقييم.</li>
                  <li>يرجى إحضار قلم جاف أزرق ومقلمة حاسبة لأداء اختبار التحقق الذهني.</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              بوابة القبول المعتمدة تقنياً بواسطة تطبيق إدارة المدارس للتكنولوجيا التطبيقية. رمز التحقق التقني: SEC-AIT-${currentApp.id.substring(0,8).toUpperCase()}
            </div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  const currentStatusIndex = () => {
    if (!currentApp) return 0;
    switch (currentApp.status) {
      case 'PENDING': return 1;
      case 'INCOMPLETE': return 1;
      case 'REVISION_REQUESTED': return 1;
      case 'ACCEPTED': return 2;
      default: return 3;
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-2" dir="rtl">
      {/* Dynamic Header Back Button */}
      <div className="flex justify-between items-center mb-3">
        <Button variant="ghost" size="sm" onClick={onBackToHome} className="text-xs font-bold text-slate-500 hover:text-indigo-600">
          <ArrowLeft size={16} className="ml-1.5" /> العودة للبوابة الرئيسية
        </Button>
        {loginStep === 'PORTAL' && (
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs font-black text-rose-500 hover:bg-rose-50 rounded-lg">
            تسجيل خروج ولي الأمر
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {loginStep === 'LOGIN' ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            <Card className="shadow-2xl border-slate-100 rounded-2xl overflow-hidden max-w-lg mx-auto">
              <CardHeader className="py-6 px-8 border-b border-slate-100 bg-slate-900 text-white relative">
                <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full"></div>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                     <Lock size={18} className="text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black">بوابة ولي الأمر الآمنة</CardTitle>
                    <CardDescription className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Parent and Guardian Admissions Portal</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                 <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex gap-3 text-slate-500">
                    <ShieldCheck className="text-indigo-600 shrink-0" size={18} />
                    <p className="text-[10px] leading-relaxed font-bold text-slate-600">
                      يضمن التشفير المزدوج ألا يطّلع على نتائج الترشيح وملاحظات لجان القبول سوى أصحاب الشأن. نرجو إدخال بيانات الطالب الرسمية المسجلة مسبقاً.
                    </p>
                 </div>

                 <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-black text-slate-800">١. كمرجع التسجيل الخاص بالطالب (رقم الاستمارة)</Label>
                      <Input 
                        value={regNum}
                        onChange={(e) => setRegNum(e.target.value)}
                        placeholder="أدخل الرمز المكون من 6 أرقام..."
                        className="h-10 border-slate-200 rounded-xl text-center font-black tracking-wide bg-slate-50/50"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-black text-slate-800">٢. الرقم القومي للطالب (أو المدخل في الاستمارة)</Label>
                      <Input 
                        value={nationalId}
                        onChange={(e) => setNationalId(e.target.value)}
                        placeholder="الرقم القومي للطالب الرقمي بالكامل..."
                        className="h-10 border-slate-200 rounded-xl text-center font-bold tracking-wider bg-slate-50/50"
                        onKeyDown={(e) => e.key === 'Enter' && handleParentLogin()}
                      />
                    </div>
                 </div>
              </CardContent>
              <CardFooter className="p-8 bg-slate-50 border-t border-slate-100">
                 <Button onClick={handleParentLogin} className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 font-black rounded-xl text-xs shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2">
                    <LogIn size={16} /> الدخول لوقاية ومتابعة الطلب
                 </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ) : (
          currentApp && (
            <motion.div
              key="portal"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              className="space-y-4"
            >
              {/* Guardian Info Banner Card */}
              <Card className="border-slate-100 shadow-xl rounded-2xl overflow-hidden bg-white">
                <div className="bg-slate-900 py-4 px-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                   <div>
                     <div className="flex items-center gap-2">
                       <Badge className="bg-indigo-600 text-white font-bold text-[9px]">ولي أمر الطالب</Badge>
                       <span className="text-[10px] text-slate-400 font-medium">رقم التقديم: #{currentApp.registrationNumber}</span>
                     </div>
                     <h3 className="text-base font-black mt-1">{currentApp.fullName}</h3>
                     <p className="text-[10px] text-slate-400 font-bold mt-1">تقديم الطلب المبدئي: {new Date(currentApp.createdAt).toLocaleDateString('ar-EG')}</p>
                   </div>
                   
                   <div className="flex gap-2.5">
                     {currentApp.status === 'ACCEPTED' && (
                       <Button onClick={downloadAdmissionCard} size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold text-[9px] h-8">
                         <Download size={13} className="ml-1" /> تحميل بطاقة الموعد
                       </Button>
                     )}
                     {(currentApp.status === 'REVISION_REQUESTED' || currentApp.status === 'INCOMPLETE') && onEditApplication && (
                       <Button onClick={() => onEditApplication(currentApp)} size="sm" className="bg-rose-600 hover:bg-rose-700 font-bold text-[9px] h-8">
                         تعديل فوري
                       </Button>
                     )}
                   </div>
                </div>

                {/* Parent Portal Sub Navigation */}
                <div className="flex border-b border-slate-100 px-4 bg-slate-50">
                  <button 
                    onClick={() => setActiveSubTab('STATUS')} 
                    className={`py-3 px-3 font-black text-[11px] relative ${activeSubTab === 'STATUS' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                     حالة القبول والمتابعة
                     {activeSubTab === 'STATUS' && <div className="absolute bottom-0 right-3 left-3 h-0.5 bg-indigo-600"></div>}
                  </button>
                  <button 
                    onClick={() => setActiveSubTab('NOTIFICATIONS')} 
                    className={`py-3 px-3 font-black text-[11px] relative flex items-center gap-2 ${activeSubTab === 'NOTIFICATIONS' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                     مركز الإشعارات
                     {notifications.some(n => n.unread) && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>}
                     {activeSubTab === 'NOTIFICATIONS' && <div className="absolute bottom-0 right-3 left-3 h-0.5 bg-indigo-600"></div>}
                  </button>
                  <button 
                    onClick={() => setActiveSubTab('HELP')} 
                    className={`py-3 px-3 font-black text-[11px] relative ${activeSubTab === 'HELP' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                     مكتب الاستفسارات
                     {activeSubTab === 'HELP' && <div className="absolute bottom-0 right-3 left-3 h-0.5 bg-indigo-600"></div>}
                  </button>
                </div>
              </Card>

              {/* Dynamic Sub Tabs Render */}
              <AnimatePresence mode="wait">
                {activeSubTab === 'STATUS' && (
                  <motion.div
                    key="status"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                  >
                    {/* Progress Timeline View */}
                    <Card className="lg:col-span-2 border-slate-100 shadow-md p-6 bg-white rounded-2xl space-y-6">
                       <div>
                         <h4 className="text-xs font-black text-slate-800">مراحل التدقيق والفرز الأكاديمي</h4>
                         <p className="text-[10px] text-slate-400 mt-0.5">تابع تطور طلب الترشيح حتى خطوة إصدار القرار النهائي</p>
                       </div>

                       {/* Interactive Timeline Visualizer */}
                       <div className="space-y-6 relative pr-4 border-r-2 border-indigo-100">
                          {/* Step 1 */}
                          <div className="relative">
                            <div className="absolute -right-[23px] top-0 w-3 h-3 rounded-full bg-emerald-500 border-4 border-white shadow"></div>
                            <div className="space-y-1">
                               <div className="flex items-center gap-2">
                                 <h5 className="text-[11px] font-black text-slate-800">١. تقديم الاستمارة الإلكترونية بنجاح</h5>
                                 <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold text-[8px]">مكتمل</Badge>
                               </div>
                               <p className="text-[10px] text-slate-400">تم تسجيل بيانات الطالب ورفع المستندات والملفات الثبوتية وحفظها في قاعدة المتابعة الموحدة.</p>
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className="relative">
                            <div className={`absolute -right-[23px] top-0 w-3 h-3 rounded-full border-4 border-white shadow ${
                              currentStatusIndex() >= 1 ? 'bg-indigo-600' : 'bg-slate-200'
                            }`}></div>
                            <div className="space-y-1">
                               <div className="flex items-center gap-2">
                                 <h5 className="text-[11px] font-black text-slate-800">٢. تدقيق الأوراق والمستندات الرسمية</h5>
                                 {currentStatusIndex() === 1 ? (
                                    <Badge className={`font-bold text-[8px] ${
                                      currentApp.status === 'REVISION_REQUESTED' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                      currentApp.status === 'INCOMPLETE' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100 animate-pulse'
                                    }`}>
                                      {currentApp.status === 'REVISION_REQUESTED' ? 'مطلوب تعديل الاستمارة' : 
                                       currentApp.status === 'INCOMPLETE' ? 'مرفقات ناقصة' : 'قيد التدقيق الحالي'}
                                    </Badge>
                                 ) : currentStatusIndex() > 1 ? (
                                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold text-[8px]">مكتمل مراجعة</Badge>
                                 ) : (
                                    <Badge className="bg-slate-50 text-slate-400 border-slate-100 font-bold text-[8px]">انتظار الدور</Badge>
                                 )}
                               </div>
                               <p className="text-[10px] text-slate-400">فحص الصور الشخصية، شهادات الطالب، الرقم القومي ومطابقة الدرجات لتأكيد صحة الترشيح الجغرافي والأكاديمي.</p>
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="relative">
                            <div className={`absolute -right-[23px] top-0 w-3 h-3 rounded-full border-4 border-white shadow ${
                              currentStatusIndex() >= 2 ? 'bg-indigo-600' : 'bg-slate-200'
                            }`}></div>
                            <div className="space-y-1">
                               <div className="flex items-center gap-2">
                                 <h5 className="text-[11px] font-black text-slate-800">٣. المقابلة الشخصية والاختبارات الأكاديمية والمهنية</h5>
                                 {currentStatusIndex() === 2 ? (
                                    <Badge className="bg-amber-50 text-amber-600 border-amber-100 font-bold text-[8px] animate-pulse">مجدول للاختبار</Badge>
                                 ) : currentStatusIndex() > 2 ? (
                                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold text-[8px]">تم الاختبار</Badge>
                                 ) : (
                                    <Badge className="bg-slate-50 text-slate-400 border-slate-100 font-bold text-[8px]">غير مفعل بعد</Badge>
                                 )}
                               </div>
                               <p className="text-[10px] text-slate-400">إجراء الفحوصات الفنية للأجهزة والمقابلات وقياس سمات القيادة والكفاءة التكنولوجية واللغوية بمقر المدرسة.</p>
                            </div>
                          </div>

                          {/* Step 4 */}
                          <div className="relative">
                            <div className={`absolute -right-[23px] top-0 w-3 h-3 rounded-full border-4 border-white shadow ${
                              currentStatusIndex() >= 3 ? 'bg-indigo-600' : 'bg-slate-200'
                            }`}></div>
                            <div className="space-y-1">
                               <div className="flex items-center gap-2">
                                 <h5 className="text-[11px] font-black text-slate-800">٤. إعلان النتائج واعتماد مجلس الإدارة</h5>
                                 {currentStatusIndex() === 3 ? (
                                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-extrabold text-[8px]">تم القرار النهائي</Badge>
                                 ) : (
                                    <Badge className="bg-slate-50 text-slate-400 border-slate-100 font-bold text-[8px]">مرحلة لاحقة</Badge>
                                 )}
                               </div>
                               <p className="text-[10px] text-slate-400">تأصيل النتيجة واعتماد كشوف المقبولين بالوزارة وإعلان القبول النهائي وإرسال الإخطارات على موبايل ولي الأمر وسداد الرسوم الدراسية.</p>
                            </div>
                          </div>
                       </div>
                    </Card>

                    {/* Quick Access Details and Action List */}
                    <div className="space-y-6">
                      {/* Notice Message from Admin Reviewers */}
                      {currentApp.notes && (
                        <Card className="border-amber-100 bg-amber-50/50 p-5 rounded-2xl relative shadow-sm">
                           <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-500 rounded-r-2xl"></div>
                           <h4 className="text-[11px] font-black text-amber-800 flex items-center gap-2 mb-2">
                             <AlertCircle size={14} /> تنبيه رسمي من لجنة القبول
                           </h4>
                           <p className="text-[11px] text-amber-950 leading-relaxed font-bold bg-white p-3 rounded-lg border border-amber-200 shadow-inner">
                             {currentApp.notes}
                           </p>
                        </Card>
                      )}

                      {/* Interview/Exam detail card */}
                      <Card className="border-slate-100 shadow-md p-5 bg-white rounded-2xl space-y-4">
                        <div className="flex items-center gap-2 text-indigo-900">
                          <Calendar size={18} />
                          <h4 className="text-xs font-black">تفاصيل موعد لجنة التقييم</h4>
                        </div>
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2 text-center">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest">تاريخ وموعد الاختبار الأكاديمي والمهني</span>
                          <p className="text-xs font-black text-indigo-950 flex items-center justify-center gap-1.5">
                            {currentApp.examDate || 'قيد الجدولة والتحديث... : يرجى الاستعلام وتحديث البوابة بانتظام'}
                          </p>
                        </div>
                        <p className="text-[9px] text-slate-400 leading-relaxed text-center">
                          الوصول المبكر لمرافقي الطالب مهم جداً لإتمام الملف التقني قبل موعد المقابلة.
                        </p>
                      </Card>

                      {/* Student Profile Quick info */}
                      <Card className="border-slate-100 shadow-sm p-3 bg-white rounded-xl space-y-2">
                         <h4 className="text-[10px] font-black text-slate-800">بيانات الطالب الأكاديمية</h4>
                         <div className="space-y-1 text-[11px] text-slate-600">
                            <div className="flex justify-between py-1 border-b border-slate-50">
                              <span className="text-[9px] text-slate-400 font-bold">المجموع الإعدادي</span>
                              <span className="font-bold text-slate-800">{currentApp.score} درجة</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-50">
                              <span className="text-[9px] text-slate-400 font-bold">نتائج اختبارات المنصة</span>
                              <span className="font-bold text-indigo-600">+{calculateGrandTotal() - (Number(currentApp.score) || 0)} درجة</span>
                            </div>
                            <div className="flex justify-between py-1 bg-indigo-50/30 p-1.5 rounded-lg">
                              <span className="text-[9px] text-indigo-700 font-black">المجموع التراكمي النهائي</span>
                              <span className="font-black text-indigo-900 text-xs">{calculateGrandTotal().toFixed(1)} / {280 + (exams.length * 100)}</span>
                            </div>
                         </div>
                      </Card>
                    </div>
                  </motion.div>
                )}

                {/* Notifications and Official Decisions Tab */}
                {activeSubTab === 'NOTIFICATIONS' && (
                  <motion.div
                    key="notifs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    <Card className="border-slate-100 shadow-md p-6 bg-white rounded-2xl">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="text-xs font-black text-slate-800">لوحة الإخطارات والمكاتيب الرسمية</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">الرسائل الموجهة خصيصاً لولي أمر الطالب بشأن مراحل التقديم</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => loadInquiriesAndNotifications(currentApp)}
                          className="text-[9px] text-slate-400 hover:text-indigo-600 h-8 font-bold"
                        >
                            <RefreshCw size={12} className="ml-1" /> تحديث البيانات
                        </Button>
                      </div>

                      <div className="space-y-4">
                        {notifications.map((notif) => (
                          <div 
                            key={notif.id} 
                            className={`p-5 rounded-2xl border transition-all hover:shadow-md ${
                              notif.id === 'status-notif' 
                                ? 'bg-indigo-50/20 border-indigo-100 relative' 
                                : 'bg-white border-slate-100'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-4 mb-2">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${
                                  notif.id === 'status-notif' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                                }`}>
                                   {notif.icon}
                                </div>
                                <h5 className="text-xs font-black text-slate-800">{notif.title}</h5>
                              </div>
                              <span className="text-[9px] text-slate-400 font-bold">{notif.date}</span>
                            </div>
                            <p className="text-[11px] text-slate-600 leading-relaxed pr-11">
                              {notif.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </motion.div>
                )}

                {/* Help, Contact, & Direct Interaction Tab */}
                {activeSubTab === 'HELP' && (
                  <motion.div
                    key="help"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                  >
                    {/* Inbox Message Area */}
                    <Card className="lg:col-span-2 border-slate-100 shadow-lg bg-white rounded-2xl flex flex-col h-[500px] overflow-hidden">
                       <CardHeader className="py-4 border-b border-slate-50 bg-slate-50/50 shrink-0">
                         <CardTitle className="text-sm font-black text-slate-800">مكتب المراسلات المشترك</CardTitle>
                         <CardDescription className="text-[10px] text-slate-400">تواصل بالرسائل المباشرة مع مدير القبول واللجان المختصة بالفرز</CardDescription>
                       </CardHeader>

                       {/* Discussion Messages */}
                       <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50/30">
                          {inquiries.map((inq) => (
                             <div 
                               key={inq.id} 
                               className={`flex ${inq.sender === 'PARENT' ? 'justify-start' : 'justify-end'}`}
                             >
                                <div className={`p-4 rounded-2xl max-w-[80%] text-right font-medium text-xs leading-relaxed shadow-sm ${
                                  inq.sender === 'PARENT' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'
                                }`}>
                                   <p className="font-extrabold text-[10px] mb-1 opacity-75">
                                      {inq.sender === 'PARENT' ? 'رسالتك (ولي الأمر)' : 'إدارة القبول والترشيح'}
                                   </p>
                                   <p className="text-xs md:text-sm font-black">{inq.message}</p>
                                   <p className="text-[8px] mt-2 opacity-50 font-mono text-left">
                                      {new Date(inq.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                   </p>
                                </div>
                             </div>
                          ))}
                       </div>

                       {/* Direct Action Area input */}
                       <div className="p-4 border-t border-slate-100 bg-white shadow-xl shrink-0 flex gap-2">
                          <Input 
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="اكتب استفسارك للجنة القبول هنا..."
                            className="h-11 border-slate-200 rounded-xl focus:bg-slate-50"
                            onKeyDown={(e) => e.key === 'Enter' && handleSendInquiry()}
                          />
                          <Button onClick={handleSendInquiry} className="h-11 bg-indigo-600 hover:bg-indigo-700 font-bold px-6 rounded-xl">
                            <Send size={14} className="ml-1" /> إرسال
                          </Button>
                       </div>
                    </Card>

                    {/* Help Support Desk FAQs */}
                    <Card className="border-slate-100 shadow-md p-6 bg-white rounded-2xl space-y-4">
                       <div className="flex items-center gap-2 text-indigo-950">
                          <HelpCircle size={18} />
                          <h4 className="text-xs font-black">أسئلة شائعة لولي الأمر</h4>
                       </div>
                       <div className="space-y-3">
                          <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                            <p className="text-[11px] font-black text-slate-800">س: متى تظهر نتيجة القبول النهائي لتقديمي؟</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed font-bold">ج: يتم الاعتماد النهائي بعد الانتهاء التام من كشوف المقابلات وعقد لجان الفحص المشترك مع ممثلي وزارة التربية والتعليم والشركاء الصناعيين.</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                            <p className="text-[11px] font-black text-slate-800">س: هل من الممكن تقديم التماس لتغيير موعد الاختبار؟</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed font-bold">ج: نعم، يمكنك إرسال التماسك وموعدك المفضل عبر صندوق المراسلات هنا لتقوم لجنة القبول بجدولة الموعد البديل إذا توفرت شواغر.</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                            <p className="text-[11px] font-black text-slate-800">س: ما العمل عند ضياع مستندات هامة؟</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed">ج: يرجى المبادرة برفع مستخرج رسمي لضمان قبول الطالب، أو التواصل معنا هاتفياً للضرورة.</p>
                          </div>
                       </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
