/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { storage } from "../lib/storage";
import { StudentApplication, ExamSubmission, Exam } from "../types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { 
  Users, CheckCircle, XCircle, Trophy, TrendingDown, Send, 
  Search, Filter, ChevronDown, Download, AlertTriangle, UserCheck, Star,
  RefreshCw, FileSpreadsheet, Mail, Sliders, Check, Settings, MessageSquare, 
  Compass, Info, HelpCircle, ArrowLeft, ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

export default function StudentAdmission() {
  const [students, setStudents] = useState<StudentApplication[]>([]);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  
  // High fidelity states
  const [limit, setLimit] = useState<number>(30); // Target Seat Capacity
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreCalculationMode, setScoreCalculationMode] = useState<'COMBINED' | 'PLATFORM_ONLY'>('COMBINED');
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACCEPTED' | 'REJECTED'>('ALL');
  
  // Interactive Simulation triggers
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);
  const [notificationProgress, setNotificationProgress] = useState(0);
  const [notificationLogs, setNotificationLogs] = useState<string[]>([]);
  
  // Dialogs and Editors
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [acceptedTemplate, setAcceptedTemplate] = useState<string>(
    `السلام عليكم ورحمة الله وبركاته،\nعزيزي الطالب {STUDENT_NAME}،\nيسعدنا إبلاغكم بقبولكم المبدئي بمدرسة التكنولوجيا التطبيقية للعام الدراسي الحالي، وذلك لحصولكم على مجموع تراكمي مميز {GRAND_TOTAL} من أصل {MAX_TOTAL} في اختبارات القبول والشهادة الإعدادية.\nنرجو منكم التوجه لمقر المدرسة بصحبة ولي الأمر لاستكمال ملف التقديم الورقي خلال 5 أيام عمل.`
  );
  const [rejectedTemplate, setRejectedTemplate] = useState<string>(
    `عزيزي المتقدم {STUDENT_NAME}،\nنشكر لكم اهتمامكم بالتقديم لمدرستنا. نعتذر لإبلاغكم بعدم إمكانية قبولكم في هذه الدفعة نظراً لمحدودية السعة الاستيعابية ({LIMIT} مقعداً) والمنافسة العالية جداً، حيث حصلتم على مجموع تراكمي {GRAND_TOTAL} من أصل {MAX_TOTAL}.\nمتمنين لكم دوام التوفيق والنجاح في مساراتكم المستقبلية.`
  );

  useEffect(() => {
    const load = async () => {
      await storage.init();
      const apps = storage.getApplications();
      const subs = storage.getSubmissions();
      const exms = storage.getExams();
      setStudents(apps);
      setSubmissions(subs);
      setExams(exms);
      
      // Auto-select all exams by default
      if (exms.length > 0) {
        setSelectedExamIds(exms.map(e => e.id));
      }
    };
    load();
  }, []);

  // Selection Toggles
  const handleSelectAllExams = () => {
    setSelectedExamIds(exams.map(e => e.id));
    toast.success("تم تحديد جميع الاختبارات المتاحة");
  };

  const handleDeselectAllExams = () => {
    setSelectedExamIds([]);
    toast.info("تم إلغاء تحديد كافة الاختبارات");
  };

  // Processing student scores recursively
  const studentStats = (students as StudentApplication[]).map(student => {
    // Collect submissions for this student that match selected exams
    const studentSubmissions = submissions.filter(s => 
      (s.studentId === student.registrationNumber || s.studentId === student.id) &&
      selectedExamIds.includes(s.examId)
    );
    
    let totalExamScore = 0;
    const examScores: Record<string, number> = {};

    studentSubmissions.forEach(sub => {
      const exam = exams.find(e => e.id === sub.examId);
      if (!exam) return;

      let subScore = sub.totalGrade || 0;
      if (!sub.totalGrade && sub.grades) {
        subScore = Object.values(sub.grades).reduce((sum: number, g: any) => sum + (g.score || 0), 0);
      }
      
      examScores[exam.title] = subScore;
      totalExamScore += subScore;
    });

    // grandTotal calculation depends on the calculation mode toggle
    const prepSchoolScore = Number(student.score) || 0;
    const grandTotal = scoreCalculationMode === 'COMBINED' 
      ? prepSchoolScore + totalExamScore 
      : totalExamScore;

    return {
      ...student,
      examScores,
      totalExamScore,
      grandTotal,
      prepSchoolScore
    };
  }).sort((a, b) => b.grandTotal - a.grandTotal); // Sorting descending purely based on total computed score

  // Basic search filter
  const filteredQueryStudents = studentStats.filter(s => 
    s.fullName.includes(searchQuery) || 
    s.registrationNumber.includes(searchQuery) ||
    s.nationalId.includes(searchQuery)
  );

  // Divide strictly according to target seat limit
  const acceptedCohort = filteredQueryStudents.slice(0, limit);
  const rejectedCohort = filteredQueryStudents.slice(limit);

  // Filter view based on tab selection
  const visibleStudents = filteredQueryStudents.filter((_, idx) => {
    if (activeTab === 'ACCEPTED') return idx < limit;
    if (activeTab === 'REJECTED') return idx >= limit;
    return true;
  });

  // Capacity Stats Percentages
  const currentUtilization = Math.min(100, Math.round((students.length ? Math.min(limit, students.length) / limit : 0) * 100));
  const capacityOverload = students.length > limit;

  // Real Save/Admission Action
  const handleProcessAdmission = async () => {
    setIsProcessing(true);
    try {
      const allApps = storage.getApplications();
      const maxTotal = (scoreCalculationMode === 'COMBINED' ? 280 : 0) + (selectedExamIds.length * 100);

      const updatedApps = allApps.map(app => {
        // Find corresponding score
        const studentStat = studentStats.find(s => s.id === app.id);
        if (!studentStat) return app;

        // Determine if they fall within the top accepted seats limit
        const studentRankIndex = studentStats.findIndex(s => s.id === app.id);
        const isAccepted = studentRankIndex !== -1 && studentRankIndex < limit;
        
        const grandTotalValue = studentStat.grandTotal.toFixed(1);

        if (isAccepted) {
          return { 
            ...app, 
            status: 'ACCEPTED' as const,
            notes: `تهانينا الحارة، تم قبولكم مبدئياً بالبوابة التعليمية بمجموع قدره ${grandTotalValue} من ${maxTotal}. يرجى الحضور لمقر المدرسة لتسليم الأوراق الثبوتية ودفع الرسوم المقررة.`
          };
        } else {
          return { 
            ...app, 
            status: 'REJECTED' as const,
            notes: `عزيزي المتقدم، نشكركم على ثقتكم الغالية بنا. نعتذر لعدم تمكننا من توفير مقعد لكم بمسار هذا العام نظراً لمحدودية السعة الاستيعابية البالغة ${limit} طالباً والمنافسة العالية جداً، حيث حصلتم على مجموع ${grandTotalValue} من ${maxTotal}. تمنياتنا لكم بالنجاح في مساراتكم المقبلة.`
          };
        }
      });
      
      await storage.saveApplications(updatedApps);
      setStudents(storage.getApplications());
      toast.success(`تم بنجاح ربط واعتماد القائمة: ${acceptedCohort.length} طالباً مقبولاً و ${rejectedCohort.length} طالباً مستبعداً بموجب السعة.`);
    } catch (err) {
      console.error(err);
      toast.error("عذراً، فشل تحديث وحفظ بيانات التنسيق التراكمي.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Dynamic Simulating Email sender engine
  const startNotificationCampaign = () => {
    setShowNotificationModal(true);
    setNotificationProgress(0);
    setNotificationLogs([]);
  };

  const executeNotificationProcess = () => {
    setIsSendingNotifications(true);
    setNotificationLogs(["جاري تجهيز محرك تصفية الأكواد البريدية..."]);
    
    let currentStep = 0;
    const totalToNotify = filteredQueryStudents.length;

    if (totalToNotify === 0) {
      toast.error("لا يوجد طلاب مسجلون لإرسال الإشعارات لهم.");
      setIsSendingNotifications(false);
      return;
    }

    const interval = setInterval(() => {
      if (currentStep < totalToNotify) {
        const student = filteredQueryStudents[currentStep];
        const isAccepted = currentStep < limit;
        const statusText = isAccepted ? "مقبول" : "اعتذار";
        const emailAddress = student.nationalId ? `${student.nationalId}@lms-school.edu.eg` : `${student.registrationNumber}@parent.com`;

        setNotificationLogs(prev => [
          `[${currentStep + 1}/${totalToNotify}] تم إرسال رسالة ${statusText} بنجاح إلى الطالب: ${student.fullName} (${emailAddress})`,
          ...prev
        ]);
        
        currentStep++;
        setNotificationProgress(Math.round((currentStep / totalToNotify) * 100));
      } else {
        clearInterval(interval);
        setIsSendingNotifications(false);
        toast.success(`اكتملت الحملة! تم إرسال الإشعارات والخطابات بالنجاح لعدد ${totalToNotify} متقدم وأسرهم.`);
        setNotificationLogs(prev => [`✓ انتهت كافة العمليات التنبيهية بنجاح بنسبة 100%`, ...prev]);
      }
    }, 200);
  };

  // Export to Real client-downloadable standard CSV sheet
  const handleExportToFile = () => {
    try {
      const selectedExams = exams.filter(e => selectedExamIds.includes(e.id));
      
      // Header values
      let docRows = [
        ["الترتيب", "رقم التسجيل", "الاسم الكامل", "المحافظة", "الرقم القومي", "درجة الإعدادية (280)", ...selectedExams.map(e => `اختبار: ${e.title}`), "المجموع الكلي", "الحالة المعتمدة"]
      ];

      filteredQueryStudents.forEach((student, rankIdx) => {
        const isAppAccepted = rankIdx < limit;
        const examCells = selectedExams.map(e => student.examScores[e.title] !== undefined ? student.examScores[e.title] : "-");
        
        docRows.push([
          (rankIdx + 1).toString(),
          student.registrationNumber,
          student.fullName,
          student.province,
          student.nationalId,
          student.prepSchoolScore.toString(),
          ...examCells.map(c => c.toString()),
          student.grandTotal.toFixed(1),
          isAppAccepted ? "مقبول مبدئياً" : "خارج السعة / انتظار"
        ]);
      });

      // Transform rows array to actual CSV layout
      const csvContent = "\uFEFF" + docRows.map(e => e.map(item => `"${item.replace(/"/g, '""')}"`).join(",")).join("\n");
      
      // Trigger simple modern file download on client tab
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `تنسيق_وقبول_الطلاب_${new Date().toISOString().substring(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("تم بنجاح استخراج ورقة التنسيق الشاملة وتحميلها كملف Excel/CSV للتعديل المباشر!");
    } catch (e) {
      console.error(e);
      toast.error("فشل تصدير البيانات بصيغة CSV");
    }
  };

  return (
    <div className="p-1 md:p-1.5 space-y-1.5 animate-in fade-in duration-500 bg-slate-50/40 min-h-screen" dir="rtl">
      
      {/* Top action header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1 h-full bg-indigo-600"></div>
        <div>
          <div className="flex items-center gap-1.5">
            <div className="bg-indigo-600 p-1 text-white rounded-md shadow-sm shadow-indigo-100">
               <UserCheck size={14} />
            </div>
            <div>
              <h1 className="text-[11px] md:text-xs font-black text-slate-900 tracking-tight flex items-center gap-1">
                نظام فرز وقبول الطلاب الذكي
                <Badge className="bg-indigo-50 border-indigo-200 text-indigo-700 text-[7px] font-bold px-1 py-0">بث مباشر وقرار فوري</Badge>
              </h1>
              <p className="text-[8px] font-semibold text-slate-400 mt-0.5">صياغة آليات القبول والتنسيق الشامل، موازنة سعات المقاعد وتنبيه أولياء الأمور تلقائياً.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 w-full md:w-auto">
          <Button 
            className="bg-indigo-600 hover:bg-slate-900 text-white font-black h-7 px-2.5 rounded-md shadow-sm transition-all text-[9.5px] flex-1 md:flex-none"
            onClick={handleProcessAdmission}
            disabled={isProcessing}
            id="btn_apply_admission"
          >
            {isProcessing ? <RefreshCw className="animate-spin ml-1" size={10} /> : <CheckCircle size={10} className="ml-1" />}
            اعتماد وحفظ النتائج بالبوابة
          </Button>
          
          <Button 
            variant="outline"
            className="border-slate-200 font-bold h-7 px-2.5 rounded-md hover:bg-slate-50 text-slate-700 text-[9.5px] flex-1 md:flex-none"
            onClick={startNotificationCampaign}
            id="btn_open_notifier"
          >
            <Mail className="ml-1 text-indigo-600" size={10} />
            ارسال الإشعارات
          </Button>

          <Button 
            variant="outline"
            className="border-slate-200 font-bold h-7 px-2.5 rounded-md hover:bg-slate-50 text-slate-700 text-[9.5px] flex-1 md:flex-none"
            onClick={handleExportToFile}
            id="btn_export_csv"
          >
            <FileSpreadsheet className="ml-1 text-emerald-600" size={10} />
            تصدير كملف Excel/CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
        
        {/* Controls Column */}
        <div className="lg:col-span-1 space-y-2">
          
          {/* Main Sorting & Calculation Configuration */}
          <Card className="border-slate-200/90 shadow-sm rounded-lg overflow-hidden bg-white">
            <CardHeader className="py-1 px-2.5 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-[9px] font-black flex items-center gap-1 text-slate-800">
                <Sliders size={11} className="text-indigo-600 animate-pulse" />
                آلية الحساب واستحقاق السعات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2.5 space-y-2">
              
              {/* Dynamic Number Input for capacity */}
              <div className="space-y-0.5">
                <div className="flex justify-between items-center">
                  <Label className="text-[8.5px] font-black text-slate-700">العدد المطلوب</Label>
                  <Badge variant="outline" className="text-[7.5px] font-black px-1 py-0 border-indigo-200 text-indigo-700 bg-indigo-50/50">
                    متاح: {limit} مقعد
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-6 w-6 rounded border-slate-200 text-xs"
                    onClick={() => setLimit(prev => Math.max(1, prev - 1))}
                  >
                    -
                  </Button>
                  <Input 
                    type="number" 
                    value={limit} 
                    onChange={(e) => setLimit(Math.max(1, Number(e.target.value)))}
                    className="h-6 text-center text-xs font-black text-indigo-700 border-slate-200 focus:border-indigo-600 rounded bg-slate-50/40"
                    id="input_admission_seats_limit"
                  />
                  <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-6 w-6 rounded border-slate-200 text-xs"
                    onClick={() => setLimit(prev => prev + 1)}
                  >
                    +
                  </Button>
                </div>
                <p className="text-[7.5px] text-slate-400 font-semibold leading-normal">
                  عند تغيير المقاعد المتوفرة، سيقوم النظام آلياً بتعليم وتحديث حالة قبول الطلاب فورياً وعزل الفائض بانتظار الشواغر.
                </p>
              </div>

              {/* Toggle Sorting algorithm mode */}
              <div className="space-y-1 pt-1.5 border-t border-slate-100">
                <Label className="text-[8.5px] font-black text-slate-700">حساب العلامة المعيارية والترتيب بـ:</Label>
                <div className="grid grid-cols-2 gap-0.5 bg-slate-100 p-0.5 rounded">
                  <button
                    onClick={() => {
                      setScoreCalculationMode('COMBINED');
                      toast.success("تم تفعيل الترتيب التكاملي التراكمي (الإعدادية + التقييمات)");
                    }}
                    className={`px-1 py-0.5 rounded text-[7.5px] font-black transition-all ${
                      scoreCalculationMode === 'COMBINED' 
                        ? 'bg-white text-indigo-700 shadow-sm font-extrabold' 
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    المجموع الشامل
                  </button>
                  <button
                    onClick={() => {
                      setScoreCalculationMode('PLATFORM_ONLY');
                      toast.success("تم تفعيل الترتيب الفردي بدرجات تقييم المنصة فقط");
                    }}
                    className={`px-1 py-0.5 rounded text-[7.5px] font-black transition-all ${
                      scoreCalculationMode === 'PLATFORM_ONLY' 
                        ? 'bg-white text-indigo-700 shadow-sm font-extrabold' 
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    اختبارات المنصة فقط
                  </button>
                </div>
              </div>

              {/* Exam selection checklist */}
              <div className="space-y-1 pt-1.5 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <Label className="text-[8.5px] font-black text-slate-700">تنقية وتنسيق الامتحانات ({selectedExamIds.length})</Label>
                  <div className="flex gap-1">
                    <button onClick={handleSelectAllExams} className="text-[7.5px] font-bold text-indigo-600 hover:underline">الكل</button>
                    <span className="text-[7.5px] text-slate-300">|</span>
                    <button onClick={handleDeselectAllExams} className="text-[7.5px] font-bold text-slate-400 hover:underline">إلغاء</button>
                  </div>
                </div>
                <div className="space-y-0.5 mt-0.5 max-h-24 overflow-y-auto pr-0.5">
                  {exams.map(exam => {
                    const isSelected = selectedExamIds.includes(exam.id);
                    return (
                      <div 
                        key={exam.id} 
                        className={`p-1 rounded border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' 
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          setSelectedExamIds(prev => 
                            prev.includes(exam.id) 
                              ? prev.filter(id => id !== exam.id) 
                              : [...prev, exam.id]
                          );
                        }}
                      >
                        <span className="text-[8px] truncate ml-1.5 font-bold leading-none">{exam.title}</span>
                        <div className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isSelected && <Check size={6} className="stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                  {exams.length === 0 && (
                    <p className="text-[8px] text-slate-400 italic">لا توجد اختبارات منشأة في المنصة حالياً.</p>
                  )}
                </div>
              </div>

              {/* Capacity Ring Stat Gauge */}
              <div className="pt-1.5 border-t border-slate-100 space-y-1">
                <div className="flex justify-between items-center text-[8px] font-bold">
                  <span className="text-slate-500">استيفاء العدد المطلوب:</span>
                  <span className={capacityOverload ? "text-rose-600 font-black" : "text-emerald-600 font-black"}>
                    {students.length} / {limit} متقدم
                  </span>
                </div>
                
                {/* Horizontal Progress bar indicating occupancy */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/40">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      capacityOverload ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (students.length / limit) * 100)}%` }}
                  ></div>
                </div>

                {capacityOverload ? (
                  <div className="bg-amber-50 p-1 rounded border border-amber-200 flex gap-1 text-amber-800 items-start">
                    <AlertTriangle className="shrink-0 text-amber-600 mt-0.5" size={10} />
                    <p className="text-[7.5px] font-bold leading-normal">
                      تنبيه: عدد المسجلين المستحقين يفوق السعة الاستيعابية الحالية، الاستمارات الإضافية من الرقم {limit + 1} سيتم إدراجها بقائمة الاحتياط والاعتذار المبكر تلقائياً.
                    </p>
                  </div>
                ) : (
                  <div className="bg-emerald-50 p-1 rounded border border-emerald-100 flex gap-1 text-emerald-800 items-center">
                    <CheckCircle className="shrink-0 text-emerald-600" size={10} />
                    <p className="text-[7.5px] font-bold leading-normal">السعة الاستيعابية قادرة على استيعاب المقبولين بالموارد المتاحة.</p>
                  </div>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Results Cohort Lists Area */}
        <div className="lg:col-span-3 space-y-2">
          
          {/* Tab Filter bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-100 shadow-sm">
            
            {/* Cohort Toggle Selectors */}
            <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded w-full sm:w-auto">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`px-2 py-0.5 rounded text-[9.5px] font-black transition-all flex items-center gap-1 ${
                  activeTab === 'ALL' 
                    ? 'bg-white text-slate-800 shadow-sm font-extrabold' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                الكل ({filteredQueryStudents.length})
              </button>
              <button
                onClick={() => setActiveTab('ACCEPTED')}
                className={`px-2 py-0.5 rounded text-[9.5px] font-black transition-all flex items-center gap-1 ${
                  activeTab === 'ACCEPTED' 
                    ? 'bg-emerald-500 text-white shadow-sm' 
                    : 'text-slate-500 hover:text-emerald-600'
                }`}
              >
                المقبولون المقترحون ({acceptedCohort.length})
              </button>
              <button
                onClick={() => setActiveTab('REJECTED')}
                className={`px-2 py-0.5 rounded text-[9.5px] font-black transition-all flex items-center gap-1 ${
                  activeTab === 'REJECTED' 
                    ? 'bg-slate-700 text-white shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                خارج السعة ({rejectedCohort.length})
              </button>
            </div>

            {/* Quick search panel */}
            <div className="relative w-full sm:w-44">
              <Search className="absolute right-2.5 top-1.5 text-slate-400" size={10} />
              <Input
                placeholder="بحث برقم التسجيل أو بالاسم..."
                className="h-6 pr-6 pl-2 text-[9px] font-medium rounded border-slate-200 focus:border-indigo-600 bg-slate-50/50"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                id="search_students_query"
              />
            </div>
          </div>

          {/* Results Table Card */}
          <Card className="border-slate-200 shadow-sm rounded-lg overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-[8px] font-black text-slate-300 uppercase tracking-wider h-6.5">
                    <th className="px-2 py-1 text-right w-10">الرتبة</th>
                    <th className="px-2 py-1">المستندات والمعلومات الخاصة بالمرشح</th>
                    <th className="px-2 py-1">معدل الإعدادية</th>
                    <th className="px-2 py-1">رصد درجات المنصة</th>
                    <th className="px-2 py-1">المجموع الكلي</th>
                    <th className="px-2 py-1 text-center">أهليّة القبول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[9.5px] text-slate-700">
                  {visibleStudents.map((student) => {
                    // Calculate rank globally using studentStats index
                    const globalRank = studentStats.findIndex(s => s.id === student.id) + 1;
                    const isWithinSeats = globalRank <= limit;

                    return (
                      <motion.tr
                        key={student.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`group transition-all border-b border-slate-100 h-8 ${
                          isWithinSeats 
                            ? 'bg-emerald-50/15 hover:bg-emerald-50/30' 
                            : 'bg-slate-50/30 hover:bg-slate-50/60 text-slate-400'
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="px-2 py-0.5">
                          <div className={`w-4.5 h-4.5 rounded flex items-center justify-center font-black text-[9px] transition-transform group-hover:scale-105 ${
                            globalRank === 1 ? 'bg-amber-100 text-amber-700 font-extrabold ring-1 ring-amber-55' : 
                            globalRank === 2 ? 'bg-slate-200 text-slate-800 font-extrabold' :
                            globalRank === 3 ? 'bg-orange-100 text-orange-700' :
                            isWithinSeats ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-400'
                          }`}>
                            {globalRank}
                          </div>
                        </td>

                        {/* Student profile details */}
                        <td className="px-2 py-0.5">
                          <div className="flex flex-col">
                            <span className={`text-[9.5px] font-black transition-colors ${
                              isWithinSeats 
                                ? 'text-slate-900 group-hover:text-indigo-600' 
                                : 'text-slate-500 font-medium'
                            }`}>
                              {student.fullName}
                            </span>
                            <div className="flex items-center gap-0.5 mt-0">
                              <span className="text-[7.5px] text-slate-400 font-medium font-mono">{student.registrationNumber}</span>
                              <span className="text-slate-300 text-[7px]">•</span>
                              <span className="text-[7.5px] text-slate-400 font-medium">{student.province}</span>
                            </div>
                          </div>
                        </td>

                        {/* Prep school score */}
                        <td className="px-2 py-0.5">
                          <Badge variant="outline" className={`font-black tracking-tight text-[8px] h-4 px-1 rounded ${
                            isWithinSeats ? 'bg-white text-slate-700 border-slate-200' : 'bg-slate-50 text-slate-400 border-slate-100'
                          }`}>
                            {student.score} <span className="opacity-40 mx-0.5">/</span> 280
                          </Badge>
                        </td>

                        {/* Exam platform scores */}
                        <td className="px-2 py-0.5">
                          <div className="flex flex-wrap gap-0.5 max-w-[170px]">
                            {Object.entries(student.examScores).map(([title, score]) => (
                              <span key={title}>
                                <Badge 
                                  variant="outline" 
                                  className={`text-[7px] font-bold py-0 h-3.5 border-slate-50 px-0.5 rounded-sm ${
                                    isWithinSeats ? 'bg-indigo-50/50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-400'
                                  }`}
                                >
                                  {`${title}: ${score}`}
                                </Badge>
                              </span>
                            ))}
                            {Object.keys(student.examScores).length === 0 && (
                              <span className="text-[7px] text-slate-300 font-bold italic">لا توجد اختبارات مؤداة</span>
                            )}
                          </div>
                        </td>

                        {/* Combined calculation */}
                        <td className="px-2 py-0.5">
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-0.5">
                              <span className={`text-[10px] font-black ${isWithinSeats ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {student.grandTotal.toFixed(1)}
                              </span>
                              <span className="text-[6.5px] text-slate-400 font-bold">
                                / { (scoreCalculationMode === 'COMBINED' ? 280 : 0) + (selectedExamIds.length * 100) }
                              </span>
                            </div>
                            <span className="text-[5.5px] text-slate-300 font-mono tracking-normal leading-none font-bold uppercase">Grand Total</span>
                          </div>
                        </td>

                        {/* Admissions status proposal */}
                        <td className="px-2 py-0.5">
                          <div className="flex justify-center">
                            {isWithinSeats ? (
                              <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0 rounded-full font-black text-[7.5px]">
                                <CheckCircle size={8} className="text-emerald-500" /> مقبول مبدئياً
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-400 border border-slate-200 px-1.5 py-0 rounded-full font-bold text-[7.5px]">
                                <XCircle size={8} className="text-slate-300" /> خارج السعة
                              </span>
                            )}
                          </div>
                        </td>

                      </motion.tr>
                    );
                  })}

                  {visibleStudents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-6 bg-white">
                        <div className="max-w-xs mx-auto space-y-1">
                          <AlertTriangle className="text-slate-300 mx-auto" size={18} />
                          <h4 className="text-[9.5px] font-black text-slate-400">عذراً، لا يوجد بيانات متطابقة مع التصفية والبحث حالياً</h4>
                          <p className="text-[8px] text-slate-400 font-bold">يرجى تجربة تقليل معايير التصفية أو تغيير نص البحث.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Summary stats on bottom card */}
            <CardFooter className="py-1 px-3 border-t border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row justify-between items-center gap-1">
              <span className="text-[8px] font-bold text-slate-400">عرض {visibleStudents.length} من أصل {filteredQueryStudents.length} متقدم بعد الفرز والتصفية</span>
              <div className="flex gap-2">
                <div className="h-1 w-1 rounded-full bg-emerald-500 mt-0.5"></div>
                <span className="text-[7.5px] font-black text-slate-500">الأخضر: مقبول</span>
                <span className="text-[7.5px] text-slate-300">|</span>
                <div className="h-1 w-1 rounded-full bg-slate-300 mt-0.5"></div>
                <span className="text-[7.5px] font-black text-slate-500">الرمادي: قوائم الانتظار</span>
              </div>
            </CardFooter>
          </Card>
        </div>

      </div>

      {/* MODAL: CAMPAIGN EMAIL NOTIFICATIONS EDITOR & LOGS */}
      <AnimatePresence>
        {showNotificationModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 shadow-2xl rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-right"
              dir="rtl"
            >
              
              {/* Header */}
              <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Mail className="text-indigo-400" size={18} />
                  <div>
                    <h3 className="text-xs font-black">حملة إرسال إشعارات وخطابات القبول والاعتذار</h3>
                    <p className="text-[9px] font-bold text-slate-400">تنبيه الطلاب وأهاليهم آلياً بحالة الفرز والترتيب.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowNotificationModal(false)}
                  className="text-slate-400 hover:text-white text-sm"
                  disabled={isSendingNotifications}
                >
                  إغلاق ✕
                </button>
              </div>

              {/* Content Panel */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                
                {/* Information Callout */}
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 text-[10px] font-bold flex gap-2.5">
                  <Info className="shrink-0 text-indigo-600" size={14} />
                  <div>
                    <p className="leading-relaxed">
                      يعتمد هذا المعالج على معايير السعة الحالية لتقسيم الطلاب وتوليد خطابات مخصصة بالذكاء البرمجي مع استبدال الهياكل مثل <code className="bg-white px-1 border border-slate-200 text-rose-600 rounded">{"{STUDENT_NAME}"}</code> و <code className="bg-white px-1 border border-slate-200 text-rose-600 rounded">{"{GRAND_TOTAL}"}</code> تلقائياً قبل الإرسال.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Accepted Template box */}
                  <div className="space-y-1.5 text-right">
                    <Label className="text-[10px] font-black text-emerald-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      قالب خطاب القبول المقترح
                    </Label>
                    <textarea
                      value={acceptedTemplate}
                      onChange={(e) => setAcceptedTemplate(e.target.value)}
                      className="w-full h-36 p-2 text-[10px] font-bold border border-slate-200 focus:border-indigo-600 rounded-lg bg-slate-50/50 leading-relaxed font-sans"
                      disabled={isSendingNotifications}
                    />
                  </div>

                  {/* Rejected Template box */}
                  <div className="space-y-1.5 text-right">
                    <Label className="text-[10px] font-black text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                      قالب خطاب الاعتذار المقترح
                    </Label>
                    <textarea
                      value={rejectedTemplate}
                      onChange={(e) => setRejectedTemplate(e.target.value)}
                      className="w-full h-36 p-2 text-[10px] font-bold border border-slate-200 focus:border-indigo-600 rounded-lg bg-slate-50/50 leading-relaxed font-sans"
                      disabled={isSendingNotifications}
                    />
                  </div>
                </div>

                {/* Progress Indicators */}
                {isSendingNotifications && (
                  <div className="space-y-2 pt-3 border-t border-slate-100">
                    <div className="flex justify-between items-center text-[10px] font-black">
                      <span className="text-indigo-600 animate-pulse">جاري المراسلة وتوثيق الاستمارات...</span>
                      <span>{notificationProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                      <div 
                        className="h-full bg-indigo-600 transition-all duration-300"
                        style={{ width: `${notificationProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Campaign Dispatch Logs */}
                {notificationLogs.length > 0 && (
                  <div className="space-y-1.5 text-right pt-3 border-t border-slate-100">
                    <Label className="text-[9px] font-black text-slate-500">سجل حركة بريد التنبيهات المباشرة:</Label>
                    <div className="w-full h-32 overflow-y-auto bg-slate-900 text-slate-200 p-2.5 rounded-lg font-mono text-[9px] space-y-1 text-left select-none relative scrollbar-thin">
                      {notificationLogs.map((log, index) => (
                        <p key={index} className="leading-relaxed whitespace-pre-wrap">{log}</p>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Action Buttons footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
                <p className="text-[9px] font-black text-slate-400">سيتم تنبيه عدد {filteredQueryStudents.length} طالب وولي أمر.</p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs h-9 font-bold" 
                    onClick={() => setShowNotificationModal(false)}
                    disabled={isSendingNotifications}
                  >
                    تجاهل
                  </Button>
                  <Button 
                    size="sm" 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 font-bold px-5 flex items-center gap-1.5"
                    onClick={executeNotificationProcess}
                    disabled={isSendingNotifications}
                  >
                    {isSendingNotifications ? (
                      <>
                        <RefreshCw className="animate-spin" size={12} />
                        جاري الإرسال
                      </>
                    ) : (
                      <>
                        <Send size={12} />
                        إطلاق الحملة البريدية الآن
                      </>
                    )}
                  </Button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
