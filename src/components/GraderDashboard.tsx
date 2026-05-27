/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { storage } from '../lib/storage';
import { Exam, ExamSubmission, StudentApplication, ExamResultRow } from '../types';
import { 
  FileCheck, 
  Search, 
  Filter, 
  ChevronRight, 
  Award, 
  Calendar,
  User as UserIcon,
  MessageSquare,
  Save,
  CheckCircle,
  Clock,
  CircleCheck,
  CircleAlert,
  ClipboardList
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from 'sonner';

export default function GraderDashboard() {
  const [submissions, setSubmissions] = useState<ExamSubmission[]>(storage.getSubmissions());
  const [apps, setApps] = useState<StudentApplication[]>(storage.getApplications());
  const [exams, setExams] = useState<Exam[]>(storage.getExams());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedExamId, setSelectedExamId] = useState<string>("all");
  const [selectedSubmission, setSelectedSubmission] = useState<ExamSubmission | null>(null);

  // States to hold the grader's active input for essay questions in the selected submission
  const [essayScores, setEssayScores] = useState<Record<string, number>>({});
  const [essayComments, setEssayComments] = useState<Record<string, string>>({});

  // Sync data
  useEffect(() => {
    const load = async () => {
      await storage.init();
      setSubmissions(storage.getSubmissions());
      setApps(storage.getApplications());
      setExams(storage.getExams());
    };
    load();
  }, []);

  // Initialize fields when a submission is selected
  useEffect(() => {
    if (!selectedSubmission) {
      setEssayScores({});
      setEssayComments({});
      return;
    }

    const exam = exams.find(e => e.id === selectedSubmission.examId);
    if (!exam) return;

    const initialScores: Record<string, number> = {};
    const initialComments: Record<string, string> = {};

    exam.questions.forEach(q => {
      if (q.type === 'ESSAY') {
        const gradeValue = selectedSubmission.grades[q.id];
        initialScores[q.id] = gradeValue ? gradeValue.score : 0;
        initialComments[q.id] = gradeValue ? gradeValue.comment : "";
      }
    });

    setEssayScores(initialScores);
    setEssayComments(initialComments);
  }, [selectedSubmission, exams]);

  const getStudentName = (sid: string) => apps.find(a => a.id === sid)?.fullName || sid;
  const getStudentNationalId = (sid: string) => apps.find(a => a.id === sid)?.nationalId || "غير متوفر";

  const getExamTitle = (eid: string) => exams.find(e => e.id === eid)?.title || "تقييم عام";

  const filteredSubmissions = submissions.filter(s => {
    const matchesSearch = getStudentName(s.studentId).toLowerCase().includes(searchTerm.toLowerCase()) ||
                        getExamTitle(s.examId).toLowerCase().includes(searchTerm.toLowerCase()) ||
                        s.id.includes(searchTerm);
    const matchesExam = selectedExamId === "all" || s.examId === selectedExamId;
    return matchesSearch && matchesExam;
  });

  const associatedExam = selectedSubmission ? exams.find(e => e.id === selectedSubmission.examId) : null;

  // Calculate scores for display
  const getAutoQuestionsScore = () => {
    if (!selectedSubmission || !associatedExam) return 0;
    let sum = 0;
    associatedExam.questions.forEach(q => {
      if (q.type !== 'ESSAY') {
        sum += (selectedSubmission.grades[q.id]?.score || 0);
      }
    });
    return sum;
  };

  const getEssayQuestionsScore = () => {
    let sum = 0;
    Object.values(essayScores).forEach(val => {
      sum += Number(val || 0);
    });
    return sum;
  };

  const getGrandTotalScore = () => {
    return getAutoQuestionsScore() + getEssayQuestionsScore();
  };

  const getExamMaxPoints = () => {
    return associatedExam?.totalPoints || 0;
  };

  const handleEssayScoreChange = (qId: string, value: number, maxPoints: number) => {
    let sanitizedVal = isNaN(value) ? 0 : value;
    if (sanitizedVal < 0) sanitizedVal = 0;
    if (sanitizedVal > maxPoints) {
      sanitizedVal = maxPoints;
      toast.warning(`الحد الأقصى للنقاط المتاحة لهذا السؤال هو ${maxPoints}`);
    }

    setEssayScores(prev => ({
      ...prev,
      [qId]: sanitizedVal
    }));
  };

  const handleEssayCommentChange = (qId: string, val: string) => {
    setEssayComments(prev => ({
      ...prev,
      [qId]: val
    }));
  };

  // Safe Grade Submission to both files
  const handleGrade = async () => {
    if (!selectedSubmission || !associatedExam) return;

    // Calculate details
    const updatedGrades = { ...selectedSubmission.grades };
    let essaySum = 0;
    let autoSum = 0;

    associatedExam.questions.forEach(q => {
      if (q.type === 'ESSAY') {
        const score = Number(essayScores[q.id] || 0);
        const comment = essayComments[q.id] || "تم التقييم من المصحح";
        updatedGrades[q.id] = { score, comment };
        essaySum += score;
      } else {
        autoSum += (selectedSubmission.grades[q.id]?.score || 0);
      }
    });

    const finalTotal = autoSum + essaySum;

    // 1. Update basic submission record
    const updatedSubmission: ExamSubmission = {
      ...selectedSubmission,
      grades: updatedGrades,
      totalGrade: finalTotal,
      status: 'GRADED'
    };
    
    await storage.saveSubmission(updatedSubmission);

    // 2. Write details down to Results Sheets
    const studentApp = apps.find(a => a.id === selectedSubmission.studentId);
    
    const breakdown: Record<string, number> = {};
    Object.entries(updatedGrades).forEach(([qid, gr]) => {
      const g = gr as { score: number; comment: string };
      breakdown[qid] = g ? g.score : 0;
    });

    const resultsRow: ExamResultRow = {
      id: selectedSubmission.id,
      studentId: selectedSubmission.studentId,
      studentName: studentApp?.fullName || selectedSubmission.studentId,
      nationalId: studentApp?.nationalId || getStudentNationalId(selectedSubmission.studentId),
      examId: selectedSubmission.examId,
      examTitle: associatedExam.title,
      autoQuizzesScore: autoSum,
      essayScore: essaySum,
      totalScore: finalTotal,
      status: 'GRADED',
      submittedAt: new Date().toISOString(),
      gradesBreakdown: breakdown
    };

    await storage.addResultRow(selectedSubmission.examId, resultsRow);

    // Refresh memory states
    setSubmissions(storage.getSubmissions());
    setSelectedSubmission(null);
    toast.success("تم رصد درجات الأسئلة المقالية بنجاح، وتحديث شيت النتائج الموحد!");
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 pb-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="text-right">
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <div className="bg-indigo-600 p-2 text-white rounded-xl shadow-lg shadow-indigo-100">
                <Award size={20} />
              </div>
              مركز المراجعة وتصحيح الاختبارات
            </h1>
            <p className="text-slate-400 text-[10px] font-black mt-1">فرز وتقييم إجابات الطلاب ورصد الدرجات في الشيت الموحد فوريّاً.</p>
          </div>

          <div className="flex items-center gap-3 text-right">
             <div className="flex flex-col items-start">
               <span className="text-[9px] font-black text-slate-400 mb-1 mr-1 uppercase">فرز حسب نموذج الاختبار</span>
               <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                 <SelectTrigger className="w-64 h-10 bg-slate-50 border-slate-200 rounded-xl font-black text-xs text-indigo-700">
                   <SelectValue placeholder="اختر الاختبار المراد مراجعته" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">كل الاختبارات (عرض الكل)</SelectItem>
                   {exams.map(e => (
                     <SelectItem key={e.id} value={e.id} className="font-bold">{e.title}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

            <div className="flex flex-col items-start">
              <span className="text-[9px] font-black text-slate-400 mb-1 mr-1 uppercase">البحث الذكي</span>
              <div className="relative w-full md:w-80">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input 
                  placeholder="اسم الطالب، أو كود التقديم..." 
                  className="pr-10 h-10 bg-slate-50 border-slate-200 focus:ring-indigo-500 rounded-xl font-black text-[11px] text-right"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Submissions List Side Desk */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">طلبات التقييم المحفوظة</h2>
            <div className="space-y-3">
              {filteredSubmissions.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center">
                  <Clock className="mx-auto text-slate-300 mb-2" size={32} />
                  <p className="text-slate-400 text-xs font-bold leading-relaxed">لا توجد أوراق أو إجابات مطابقة لخيارات الفرز حالياً.</p>
                </div>
              ) : (
                filteredSubmissions.map(sub => (
                  <motion.div
                    key={sub.id}
                    layoutId={sub.id}
                    className={`bg-white border p-5 rounded-2xl cursor-pointer transition-all hover:shadow-md ${selectedSubmission?.id === sub.id ? 'border-indigo-600 ring-2 ring-indigo-600/20' : 'border-slate-200'}`}
                    onClick={() => setSelectedSubmission(sub)}
                  >
                    <div className="flex justify-between items-start mb-2.5">
                       <Badge variant="outline" className={sub.status === 'GRADED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 font-bold text-[10px]' : 'bg-amber-50 text-amber-700 border-amber-100 font-bold text-[10px]'}>
                         {sub.status === 'GRADED' ? 'تم الرصد والمصادقة' : 'بانتظار تصحيح المقالي'}
                       </Badge>
                       <span className="text-[10px] text-slate-400 font-mono">#{sub.id.slice(0, 8)}</span>
                    </div>
                    <h3 className="font-extrabold text-sm text-slate-930 text-right">{getStudentName(sub.studentId)}</h3>
                    <p className="text-[11px] text-slate-450 mt-1 text-right font-medium">{getExamTitle(sub.examId)}</p>
                    
                    {sub.totalGrade !== undefined && (
                      <p className="text-xs font-black text-indigo-600 mt-2 text-right">مجموع الدرجات المعتمدة: {sub.totalGrade} درجة</p>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Details & Interactive Correction Slate */}
          <div className="lg:col-span-2">
            {selectedSubmission && associatedExam ? (
              <Card className="border-slate-200 shadow-xl overflow-hidden rounded-3xl bg-white text-right">
                
                {/* Header card info */}
                <CardHeader className="bg-slate-900 text-white border-b-0 py-6 px-8">
                   <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shadow-inner">
                         <UserIcon size={24} className="text-white" />
                       </div>
                       <div>
                         <CardTitle className="text-lg font-black">{getStudentName(selectedSubmission.studentId)}</CardTitle>
                         <p className="text-white/60 text-[11px] font-bold mt-1">الرقم القومي: {getStudentNationalId(selectedSubmission.studentId)} | كود الطالب: {selectedSubmission.studentId}</p>
                       </div>
                     </div>
                     <div className="bg-indigo-600/40 border border-indigo-500/30 px-4 py-2 rounded-xl text-left font-semibold">
                       <span className="text-[9px] text-indigo-200 block text-right font-bold">نموذج الامتحان</span>
                       <span className="text-white text-xs font-black">{associatedExam.title}</span>
                     </div>
                   </div>
                </CardHeader>

                <CardContent className="p-8 space-y-8">
                  
                  {/* REQUIREMENT 1: Previous Auto-Graded Questions list */}
                  <div className="space-y-4">
                    <h3 className="font-black text-slate-900 border-r-4 border-indigo-600 pr-3 text-sm">
                      درجات الأسئلة والتقييمات التلقائية السابقة (الخيارات، الصح/الخطأ والمطابقة)
                    </h3>
                    
                    <div className="space-y-3.5">
                      {associatedExam.questions.filter(q => q.type !== 'ESSAY').length === 0 ? (
                        <p className="text-[11px] text-slate-450 italic bg-slate-50 p-4 rounded-xl border border-slate-100">لا توجد أسئلة خيارات أو صح وخطأ في نموذج الامتحان هذا.</p>
                      ) : (
                        associatedExam.questions.filter(q => q.type !== 'ESSAY').map((q, idx) => {
                          const studentAns = selectedSubmission.answers[q.id];
                          const scoreObj = selectedSubmission.grades[q.id];
                          const scoreAchieved = scoreObj ? scoreObj.score : 0;
                          const isCorrect = scoreAchieved > 0;

                          return (
                            <div key={q.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="space-y-1 md:max-w-[70%] text-right">
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-indigo-50 text-indigo-700 text-[9px] font-bold">
                                    {q.type === 'TRUE_FALSE' ? 'صح/خطأ' : q.type === 'MULTIPLE_CHOICE' ? 'اختيار متعدد' : 'ربط ومطابقة'}
                                  </Badge>
                                  <span className="text-xs text-slate-400 font-bold">سؤال {idx + 1}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-800 leading-relaxed">{q.text}</p>
                                
                                {q.type === 'MATCHING' ? (
                                  <div className="text-[10px] text-slate-500 font-semibold space-y-1 pt-1">
                                    <strong>إجابة الطالب:</strong>
                                    {studentAns ? Object.entries(studentAns).map(([l, r], matchIdx) => (
                                      <div key={matchIdx} className="mr-2">🔗 {l} ➔ {String(r)}</div>
                                    )) : <span className="text-rose-500 italic">لم تتم الإجابة</span>}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-slate-500 font-semibold">
                                    <strong>الدرج الكلية المتاحة:</strong> {q.points} نقاط • 
                                    <strong>إجابة الطالب:</strong> <span className={isCorrect ? "text-emerald-600 font-bold" : "text-slate-650"}>{studentAns === undefined ? "لم يتم الإجابة" : String(studentAns)}</span> •
                                    {q.correctAnswer && <span><strong>الإجابة النموذجية:</strong> {String(q.correctAnswer)}</span>}
                                  </p>
                                )}
                              </div>
                              
                              <Badge className={`px-3 py-1 text-xs font-black ${isCorrect ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                الدرجة المحرزة: {scoreAchieved} / {q.points} درجة
                              </Badge>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <hr className="border-slate-100" />

                  {/* REQUIREMENT 2: Essay Questions Correction Block */}
                  <div className="space-y-5">
                    <h3 className="font-black text-slate-900 border-r-4 border-amber-500 pr-3 text-sm">
                      الأسئلة المقالية والإنشائية بانتظار التصحيح والتقييم اليدوي
                    </h3>

                    <div className="space-y-5">
                      {associatedExam.questions.filter(q => q.type === 'ESSAY').length === 0 ? (
                        <div className="bg-slate-50 text-slate-500 border border-slate-100 p-5 rounded-2xl text-center text-xs font-bold font-semibold">
                          لا يحتوي نموذج هذا الامتحان على أي تساؤلات أو أجزاء مقالية تتطلب تصحيحاً يدوياً.
                        </div>
                      ) : (
                        associatedExam.questions.filter(q => q.type === 'ESSAY').map((q, idx) => {
                          const studentAnswerText = selectedSubmission.answers[q.id];
                          const score = essayScores[q.id] || 0;
                          const comment = essayComments[q.id] || "";

                          return (
                            <div key={q.id} className="p-6 rounded-2xl border border-dashed border-slate-200 bg-white space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                <div className="space-y-0.5 text-right">
                                  <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[9px] font-bold">سؤال مقالي</Badge>
                                  <span className="text-xs text-slate-400 font-bold mr-2">مخصص له: {q.points} درجات كحد أقصى</span>
                                </div>
                                <span className="text-xs font-black text-slate-700">السؤال {idx + 1}</span>
                              </div>

                              <div className="space-y-1.5 text-right">
                                <p className="text-xs font-extrabold text-[#111]">{q.text}</p>
                                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-slate-800 text-xs font-semibold leading-relaxed whitespace-pre-wrap leading-relaxed mr-1">
                                  {studentAnswerText ? String(studentAnswerText) : <span className="text-rose-600 italic font-bold">لم يكتب الطالب أي إجابة لهذا السؤال المقالي.</span>}
                                </div>
                              </div>

                              {/* Input score and comments */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 text-right">
                                <div className="space-y-1 md:col-span-1">
                                  <label className="text-[10px] font-black text-slate-500">الدرجة المستحقة (من {q.points})</label>
                                  <Input 
                                    type="number"
                                    min={0}
                                    max={q.points}
                                    className="h-10 bg-white border-slate-200 rounded-xl text-center font-black text-sm"
                                    value={score}
                                    onChange={(e) => handleEssayScoreChange(q.id, Number(e.target.value), q.points)}
                                    required
                                  />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                  <label className="text-[10px] font-black text-slate-500">ملاحظات ومخرجات المصحح</label>
                                  <Input 
                                    placeholder="أدخل أي ملاحظات على صياغة الطالب للمقال للتبيان..."
                                    className="h-10 bg-white border-slate-200 rounded-xl font-semibold text-xs text-right"
                                    value={comment}
                                    onChange={(e) => handleEssayCommentChange(q.id, e.target.value)}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* GRAND GRADE SUMMARY REPORT BOARD */}
                  <div className="bg-slate-900 text-white rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="text-right space-y-1">
                      <h4 className="font-extrabold text-sm flex items-center gap-2">
                        <ClipboardList size={18} className="text-indigo-400" /> ملخص كشف الرصد الفوري
                      </h4>
                      <p className="text-slate-400 text-[10px] font-medium leading-relaxed">تُحسب الأرقام ديناميكياً بناءً على إجمالي نقاط خيارات التقييم المضافة</p>
                    </div>

                    <div className="flex items-center gap-6 font-bold text-xs" dir="ltr">
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] text-white/40 block">مجموع المقالي</span>
                        <span className="text-emerald-400 text-sm font-black">{getEssayQuestionsScore()} درجة</span>
                      </div>
                      <div className="h-4 w-px bg-white/20" />
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] text-white/40 block">مجموع التلقائي</span>
                        <span className="text-indigo-400 text-sm font-black">{getAutoQuestionsScore()} درجة</span>
                      </div>
                      <div className="h-4 w-px bg-white/20" />
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] text-white/50 block">الدرجة التراكمية الكلية</span>
                        <span className="text-white text-md font-black">{getGrandTotalScore()} / {getExamMaxPoints()} درجة</span>
                      </div>
                    </div>
                  </div>

                  {/* SAVE ACTION BUTTON */}
                  <Button 
                    className="w-full h-13 bg-slate-900 hover:bg-black text-white rounded-xl font-black gap-2 text-sm shadow-xl transition-all active:scale-[0.98]"
                    onClick={handleGrade}
                  >
                    <Save size={18} /> حفظ درجات المقالي واعتماد نتيجة الطالب التراكمية في الشيت
                  </Button>

                </CardContent>
              </Card>
            ) : (
              <div className="h-[450px] flex flex-col items-center justify-center bg-white border border-dashed border-slate-200 rounded-3xl text-slate-400 space-y-4">
                <FileCheck size={48} className="text-slate-200" />
                <p className="font-extrabold text-sm text-slate-600">يرجى اختيار کشف امتحان من القائمة الجانبية لبدء فحص وتقييم المقالات</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
