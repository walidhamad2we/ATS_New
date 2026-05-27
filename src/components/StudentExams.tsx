/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { storage } from '../lib/storage';
import { Exam, ExamSubmission, StudentApplication, ExamResultRow } from '../types';
import { 
  BookOpen, 
  AlertCircle, 
  Clock, 
  ChevronRight, 
  ChevronLeft,
  Play, 
  CheckCircle2, 
  UserCheck, 
  ArrowLeft, 
  LogOut, 
  FileText, 
  HelpCircle,
  Award,
  CircleCheck,
  CircleAlert
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';

export default function StudentExams() {
  const [exams, setExams] = useState<Exam[]>(storage.getExams());
  const [submissions, setSubmissions] = useState<ExamSubmission[]>(storage.getSubmissions());
  const [apps, setApps] = useState<StudentApplication[]>(storage.getApplications());

  // Student Session
  const [sessionApp, setSessionApp] = useState<StudentApplication | null>(null);
  const [loginRegNum, setLoginRegNum] = useState("");
  const [loginNationalId, setLoginNationalId] = useState("");

  // Exam Taking Wizard State
  const [view, setView] = useState<'LOGIN' | 'LIST' | 'WELCOME' | 'TAKING' | 'FINISHED'>('LOGIN');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState(false);

  // Load and check existing session
  useEffect(() => {
    const load = async () => {
      await storage.init();
      setExams(storage.getExams());
      setSubmissions(storage.getSubmissions());
      setApps(storage.getApplications());

      const saved = localStorage.getItem('student_exam_session');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const currentApps = storage.getApplications();
          const found = currentApps.find(a => a.id === parsed.id || a.registrationNumber === parsed.registrationNumber);
          if (found) {
            setSessionApp(found);
            setView('LIST');
          } else {
            localStorage.removeItem('student_exam_session');
          }
        } catch (e) {
          localStorage.removeItem('student_exam_session');
        }
      }
    };
    load();
  }, []); // Only on mount to avoid resets during view transitions

  // Sync Timer for active exams
  useEffect(() => {
    if (view !== 'TAKING' || !activeExam) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          toast.warning("انتهى وقت الاختبار المحدد! جاري حفظ الإجابات تلقائياً وتسليم الاختبار حفاظاً على درجاتك.");
          handleForceSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [view, activeExam, currentQuestionIdx]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginRegNum.trim() || !loginNationalId.trim()) {
      toast.error("يرجى إدخال كلاً من رقم التسجيل والرقم القومي للتسجيل");
      return;
    }

    const found = apps.find(
      a => 
        (a.registrationNumber === loginRegNum.trim() || a.id === loginRegNum.trim()) && 
        a.nationalId === loginNationalId.trim()
    );

    if (found) {
      setSessionApp(found);
      localStorage.setItem('student_exam_session', JSON.stringify(found));
      setView('LIST');
      toast.success(`أهلاً بك، تم تسجيل الدخول باسم الطالب/ة: ${found.fullName}`);
    } else {
      toast.error("لم يتم العثور على طالب مطابق للبيانات المدخلة. يرجى التحقق وإعادة المحاولة.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('student_exam_session');
    setSessionApp(null);
    setView('LOGIN');
    setActiveExam(null);
    toast.info("تم تسجيل خروج الطالب بأمان");
  };

  const isExamAvailable = (exam: Exam): boolean => {
    if (exam.visible === false) return false;
    
    const now = new Date();
    
    if (exam.startDate) {
      const startDateTime = `${exam.startDate}T${exam.startTime || '00:00'}`;
      const startObj = new Date(startDateTime);
      if (!isNaN(startObj.getTime()) && now < startObj) return false;
    }
    
    if (exam.endDate) {
      const endDateTime = `${exam.endDate}T${exam.endTime || '23:59'}`;
      const endObj = new Date(endDateTime);
      if (!isNaN(endObj.getTime()) && now > endObj) return false;
    }
    
    return true;
  };

  const hasSubmitted = (examId: string): boolean => {
    return submissions.some(sub => sub.studentId === sessionApp?.id && sub.examId === examId);
  };

  const startExamFlow = (exam: Exam) => {
    if (hasSubmitted(exam.id)) {
      toast.warning("لقد قمت بتأدية هذا الاختبار وتسليمه مسبقاً!");
      return;
    }
    setActiveExam(exam);
    setAnswers({});
    setView('WELCOME');
  };

  const startActualTest = () => {
    if (!activeExam) return;
    setView('TAKING');
    setCurrentQuestionIdx(0);
    
    // Set time limits based on Mode
    if (activeExam.timingMode === 'GLOBAL') {
      setTimeLeft(activeExam.globalTimeLimit || 1800);
    } else {
      const firstQ = activeExam.questions[0];
      setTimeLeft(firstQ?.timeLimit || 60);
    }
  };

  // Answer handler for MCQ and TF
  const selectChoice = (qId: string, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: value
    }));
  };

  // Answer handler for Matching
  const selectMatchingChoice = (qId: string, leftText: string, rightText: string) => {
    setAnswers(prev => {
      const currentVal = prev[qId] || {};
      return {
        ...prev,
        [qId]: {
          ...currentVal,
          [leftText]: rightText
        }
      };
    });
  };

  // Next Question handling
  const nextQuestion = () => {
    if (!activeExam) return;
    if (currentQuestionIdx < activeExam.questions.length - 1) {
      const nextIdx = currentQuestionIdx + 1;
      setCurrentQuestionIdx(nextIdx);
      if (activeExam.timingMode === 'QUESTION') {
        const nextQ = activeExam.questions[nextIdx];
        setTimeLeft(nextQ?.timeLimit || 60);
      }
    } else {
      setIsConfirmSubmitOpen(true);
    }
  };

  // Previous Question handling
  const prevQuestion = () => {
    if (currentQuestionIdx > 0) {
      const prevIdx = currentQuestionIdx - 1;
      setCurrentQuestionIdx(prevIdx);
      if (activeExam.timingMode === 'QUESTION') {
        const prevQ = activeExam?.questions[prevIdx];
        setTimeLeft(prevQ?.timeLimit || 60);
      }
    }
  };

  // Force automatic submission on timer expire
  const handleForceSubmit = () => {
    setIsConfirmSubmitOpen(false);
    submitExamAnswers(true);
  };

  // Main Grade Calculation & Submission Integration
  const submitExamAnswers = async (forced: boolean = false) => {
    if (!activeExam || !sessionApp) return;

    let totalPointsAwarded = 0;
    const gradesBreakdown: Record<string, number> = {};
    const gradesDetails: Record<string, { score: number; comment: string }> = {};
    let containsEssay = false;

    // Loop through each question inside the exam to grade it
    activeExam.questions.forEach(q => {
      const studentAns = answers[q.id];
      let scoreAwarded = 0;

      if (q.type === 'TRUE_FALSE') {
        if (studentAns === q.correctAnswer) {
          scoreAwarded = q.points;
        }
        gradesDetails[q.id] = { score: scoreAwarded, comment: scoreAwarded > 0 ? 'إجابة صحيحة تلقائياً' : 'إجابة خاطئة تلقائياً' };
      } else if (q.type === 'MULTIPLE_CHOICE') {
        if (String(studentAns).trim() === String(q.correctAnswer).trim()) {
          scoreAwarded = q.points;
        }
        gradesDetails[q.id] = { score: scoreAwarded, comment: scoreAwarded > 0 ? 'إجابة صحيحة تلقائياً' : 'إجابة خاطئة تلقائياً' };
      } else if (q.type === 'MATCHING') {
        // Evaluate Matching pairs. We award partial points proportional to correct matching choices!
        const pairs = q.matchingPairs || [];
        const studentMappings = studentAns || {};
        let correctMatchesCount = 0;

        pairs.forEach(pair => {
          if (studentMappings[pair.left] === pair.right) {
            correctMatchesCount++;
          }
        });

        if (pairs.length > 0) {
          const ratio = correctMatchesCount / pairs.length;
          scoreAwarded = Math.round(ratio * q.points * 10) / 10;
        }
        gradesDetails[q.id] = { 
          score: scoreAwarded, 
          comment: `تمت المطابقة بنجاح لعدد (${correctMatchesCount} من أصل ${pairs.length}) فقرات` 
        };
      } else if (q.type === 'ESSAY') {
        containsEssay = true;
        // Essay is graded manually. Thus, initialized to 0.
        scoreAwarded = 0;
        gradesDetails[q.id] = { score: 0, comment: 'بانتظار مراجع ومصحح الأسئلة المقالية' };
      }

      totalPointsAwarded += scoreAwarded;
      gradesBreakdown[q.id] = scoreAwarded;
    });

    // Create the final Submission Structure
    const newSubmissionId = crypto.randomUUID();
    const submission: ExamSubmission = {
      id: newSubmissionId,
      examId: activeExam.id,
      studentId: sessionApp.id,
      answers: answers,
      grades: gradesDetails,
      totalGrade: totalPointsAwarded,
      status: containsEssay ? 'SUBMITTED' : 'GRADED'
    };

    // Save submission to basic database
    await storage.saveSubmission(submission);

    // Save to the corresponding results sheet as a flat row
    const resultRow: ExamResultRow = {
      id: newSubmissionId,
      studentId: sessionApp.id,
      studentName: sessionApp.fullName,
      nationalId: sessionApp.nationalId,
      examId: activeExam.id,
      examTitle: activeExam.title,
      autoQuizzesScore: totalPointsAwarded,
      essayScore: 0,
      totalScore: totalPointsAwarded,
      status: containsEssay ? 'SUBMITTED' : 'GRADED',
      submittedAt: new Date().toISOString(),
      gradesBreakdown
    };

    await storage.addResultRow(activeExam.id, resultRow);

    // Refresh memory states
    setSubmissions(storage.getSubmissions());
    setView('FINISHED');
    if (forced) {
       toast.warning("تم إغلاق الاختبار بنجاح ونقل درجاتك التلقائية لمركز الرصد الموحد.");
    } else {
       toast.success("تم إرسال إجابات الامتحان بنجاح وتسجيل الدرجات بمركز الرصد الموحد.");
    }
  };

  // Convert seconds to clean display MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSubmissionsCount = () => {
    return exams.filter(isExamAvailable).filter(e => hasSubmitted(e.id)).length;
  };

  const activeQuestion = activeExam?.questions[currentQuestionIdx];

  return (
    <div className="min-h-screen bg-slate-50/50 pb-12 font-sans" dir="rtl">
      {/* Dynamic Header */}
      <AnimatePresence mode="wait">
        {view !== 'TAKING' && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2.5 text-white rounded-xl shadow-md">
                <BookOpen size={24} />
              </div>
              <div className="text-right">
                <h1 className="text-lg font-black text-slate-900 leading-none">منصة الاختبارات والتقييمات للطلاب</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">المدرسة الوطنية التطبيقية للتكنولوجيا القبول لعام ٢٠٢٦ - ٢٠٢٧</p>
              </div>
            </div>

            {sessionApp && (
              <div className="flex items-center gap-4">
                <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl flex items-center gap-3 text-right">
                  <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center">
                    {sessionApp.fullName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold">حساب الطالب الحالي</p>
                    <p className="text-sm font-black text-slate-900">{sessionApp.fullName}</p>
                  </div>
                </div>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-red-500 border-red-200 hover:bg-red-50" onClick={handleLogout}>
                  <LogOut size={18} />
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto px-4 mt-8">
        <AnimatePresence mode="wait">

          {/* 1. LOGIN / IDENTIFICATION SCREEN */}
          {view === 'LOGIN' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto"
            >
              <Card className="border-slate-200 shadow-xl rounded-3xl overflow-hidden mt-8 md:mt-16 bg-white">
                <div className="h-3 bg-gradient-to-l from-indigo-500 via-pink-500 to-amber-400" />
                <CardHeader className="p-8 text-center space-y-3">
                  <div className="w-16 h-16 bg-indigo-55 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                    <UserCheck size={32} />
                  </div>
                  <CardTitle className="text-2xl font-black text-slate-900">إثبات هوية الطالب</CardTitle>
                  <CardDescription className="text-slate-500 text-xs font-bold leading-relaxed">
                    يرجى إدخال رقم تسجيل الطالب والرقم القومي المذكور في استمارة التقديم الرسمية للوصول للاختبارات النشطة لك.
                  </CardDescription>
                </CardHeader>

                <form onSubmit={handleLogin}>
                  <CardContent className="p-8 pt-0 space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="regNum" className="text-xs font-black text-slate-700">رقم التسجيل الاستماراتي أو الكود</Label>
                      <Input
                        id="regNum"
                        placeholder="أدخل كود الطالب أو رقم استمارة التسجيل..."
                        value={loginRegNum}
                        onChange={(e) => setLoginRegNum(e.target.value)}
                        className="h-12 bg-slate-50/50 border-slate-200 focus:ring-2 focus:ring-indigo-500 rounded-xl text-center font-bold placeholder:text-slate-400"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nationalId" className="text-xs font-black text-slate-700">الرقم القومي للطالب</Label>
                      <Input
                        id="nationalId"
                        placeholder="١٤ رقماً قومياً كاملاً للطالب..."
                        type="password"
                        value={loginNationalId}
                        onChange={(e) => setLoginNationalId(e.target.value)}
                        className="h-12 bg-slate-50/50 border-slate-200 focus:ring-2 focus:ring-indigo-500 rounded-xl text-center font-bold tracking-[0.2em] placeholder:text-slate-400"
                        maxLength={14}
                        required
                      />
                    </div>
                  </CardContent>

                  <CardFooter className="p-8 pt-0">
                    <Button type="submit" className="w-full h-13 bg-slate-900 hover:bg-black font-black text-md text-white rounded-xl shadow-lg transition-transform active:scale-[0.98]">
                      التحقق ودخول منصة الاختبارات
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </motion.div>
          )}

          {/* 2. EXAMS LIST VIEW */}
          {view === 'LIST' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="bg-slate-900 text-white rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                <div className="space-y-2 text-right">
                  <h2 className="text-2xl font-black">أهلاً بك، {sessionApp?.fullName} 👋</h2>
                  <p className="text-slate-300 text-sm font-medium">تم رصد وتنشيط الاختبارات المطابقة لك. مجموع أدائك الحالي هو {getSubmissionsCount()} اختبار.</p>
                </div>
                <div className="bg-white/10 px-5 py-3 rounded-2xl text-center min-w-36">
                  <span className="text-[10px] text-white/50 block font-bold">حالة الطلب الحالي</span>
                  <Badge className="bg-indigo-500 hover:bg-indigo-500 text-white mt-1.5 font-black px-3.5 py-1 text-xs">
                    {sessionApp?.status === 'ACCEPTED' ? 'تم القبول للاختبار' : 'قيد الفحص والمراجعة'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {exams.filter(exam => isExamAvailable(exam) && !hasSubmitted(exam.id)).length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 flex flex-col items-center justify-center text-center space-y-4 col-span-2">
                    <CircleAlert size={48} className="text-slate-300" />
                    <h3 className="text-lg font-bold text-slate-700">لا يوجد اختبارات مدشنة نشطة حالياً</h3>
                    <p className="text-sm text-slate-500 max-w-sm">سيتم فتح الامتحانات فور جدولتها من قبل إدارة التدريب والمقاييس والقبول بمدارس التكنولوجيا التطبيقية.</p>
                  </div>
                ) : (
                  exams.filter(exam => isExamAvailable(exam) && !hasSubmitted(exam.id)).map(exam => {
                    const submitted = hasSubmitted(exam.id);
                    return (
                      <Card key={exam.id} className="border-slate-200 overflow-hidden rounded-2xl bg-white shadow-sm hover:shadow-lg transition-all flex flex-col h-full">
                        <CardHeader className="bg-slate-50/80 border-b border-slate-100 p-6 flex flex-row items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="font-extrabold text-lg text-slate-800">{exam.title}</h3>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                              <Clock size={14} className="text-indigo-600" />
                              <span>{exam.timingMode === 'GLOBAL' ? `زمن كلي: ${Math.floor((exam.globalTimeLimit || 1800) / 60)} دقيقة` : 'زمن محدد لكل سؤال مسبقاً'}</span>
                            </div>
                          </div>
                          {submitted ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 px-2 py-1 flex items-center gap-1">
                              <CircleCheck size={12} /> مكتمل
                            </Badge>
                          ) : (
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-50 px-2 py-1">نشط الآن</Badge>
                          )}
                        </CardHeader>
                        <CardContent className="p-6 flex-grow space-y-4 text-sm font-bold text-slate-500">
                          <p className="text-xs text-slate-400 leading-relaxed font-semibold italic">انتبه الشروط: يرجى عدم قفل أو تحديث الصفحة بعد بدء الاختبار لضمان تسجيل الدرجات.</p>
                          <div className="flex gap-8 justify-start text-xs font-black">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-400 uppercase tracking-widest">عدد الأسئلة</span>
                              <span className="text-slate-800 mt-0.5">{exam.questions.length} أسئلة صح/خطأ ومقال</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-400 uppercase tracking-widest">مجموع النقاط</span>
                              <span className="text-slate-800 mt-0.5">{exam.totalPoints} نقطة كلية</span>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="p-6 pt-0 mt-auto">
                          {submitted ? (
                            <Button disabled className="w-full h-11 bg-slate-100 text-slate-400 rounded-xl cursor-not-allowed font-extrabold">
                              تم تسليم الإجابات بنجاح
                            </Button>
                          ) : (
                            <Button className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold gap-2" onClick={() => startExamFlow(exam)}>
                              بدء الاختبار <ChevronLeft size={16} />
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* 3. WELCOME STATE / GUIDE BEFORE TEST */}
          {view === 'WELCOME' && activeExam && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xl mx-auto"
            >
              <Card className="border-slate-200 shadow-xl rounded-3xl bg-white overflow-hidden mt-6 text-right">
                <CardHeader className="bg-slate-50 border-b border-slate-100 p-8 text-center space-y-2">
                  <Award size={40} className="text-amber-500 mx-auto" />
                  <CardTitle className="text-xl font-black text-slate-900">{activeExam.title}</CardTitle>
                  <p className="text-xs text-slate-500 font-bold">شروط وإرشادات التقييم المعياري الرسمي</p>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-extrabold text-slate-800 flex items-center gap-2 border-r-4 border-indigo-600 pr-2">توجيهات الاختبار:</h4>
                    <ul className="text-xs text-slate-600 font-medium space-y-2.5 leading-relaxed list-disc list-inside">
                      <li>تأكد من استقرار الكهرباء والإنترنت قبل نقر خيار البدء.</li>
                      <li>الوقت الإجمالي للاختبار هو <strong>{activeExam.timingMode === 'GLOBAL' ? `${Math.floor((activeExam.globalTimeLimit || 1800) / 60)} دقيقة` : 'زمن محدد لكل سؤال بشكل مستقل'}</strong>.</li>
                      <li>سيتم إغلاق الاختبار وإرسال إجاباتك تلقائياً إذا نفد الوقت دون أي خسائر لدرجاتك التراكمية المحفوظة.</li>
                      <li>تُحفظ درجات الأسئلة الأوتوماتيكية (صح وخطأ والاختيارات والمطابقة) فورياً بمركز الرصد.</li>
                      <li>درجات الأسئلة المقالية ستُدرج فور انتهاء المصحح التقني من تصحيحها لتعرض نتيجتك التراكمية.</li>
                    </ul>
                  </div>

                  {activeExam.welcomeMessage && (
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs text-indigo-900 font-bold leading-relaxed">
                      {activeExam.welcomeMessage}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="p-8 pt-0 flex gap-4">
                  <Button variant="outline" className="flex-1 h-12 rounded-xl border-slate-200 font-bold text-slate-600 text-xs gap-2" onClick={() => setView('LIST')}>
                    <ChevronRight size={14} /> تراجع والعودة للقائمة
                  </Button>
                  <Button className="flex-1 h-12 bg-indigo-600 hover:bg-slate-950 font-black text-xs text-white rounded-xl shadow-lg gap-2" onClick={startActualTest}>
                    بدء الإجابة الآن والمطابقة <ChevronLeft size={14} />
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {/* 4. ACTIVE ASSESSMENT TAKING INTERFACE */}
          {view === 'TAKING' && activeExam && activeQuestion && (
            <motion.div
              key="taking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* TOP EXAM INTERACTIVE DECK BAR */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md flex items-center justify-between gap-4">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider">الاختبار قيد التقييم</span>
                  <h2 className="text-lg font-black text-slate-900 leading-tight">{activeExam.title}</h2>
                </div>

                {/* COUNTDOWN CLOCK CIRCLE ACCENT */}
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 px-5 py-2.5 rounded-2xl">
                  <Clock size={20} className={timeLeft < 120 ? "text-rose-500 animate-pulse" : "text-indigo-600"} />
                  <div className="text-left font-mono">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block text-right">الوقت المتبقي</span>
                    <span className={`text-lg font-black ${timeLeft < 120 ? "text-rose-600" : "text-slate-800"}`}>
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                </div>
              </div>

              {/* PROGRESS BAR */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full transition-all duration-300"
                  style={{ width: `${((currentQuestionIdx + 1) / activeExam.questions.length) * 100}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-black text-slate-400 mt-1">
                <span>درجة هذا السؤال: {activeQuestion.points} درجات</span>
                <span>سؤال {currentQuestionIdx + 1} من أصل {activeExam.questions.length}</span>
              </div>

              {/* MAIN QUESTION DECK CARD */}
              <Card className="border-slate-200 shadow-xl rounded-3xl bg-white overflow-hidden text-right">
                <CardContent className="p-8 space-y-8">
                  <div className="space-y-3">
                    <Badge variant="outline" className="bg-indigo-50 border-indigo-100 text-indigo-700 font-bold text-xs">
                      {activeQuestion.type === 'TRUE_FALSE' ? 'سؤال صح أم خطأ' :
                       activeQuestion.type === 'MULTIPLE_CHOICE' ? 'سؤال اختيار من متعدد' :
                       activeQuestion.type === 'MATCHING' ? 'سؤال الربط والمزاوجة الثنائية' : 'سؤال مقالي واستنتاجي'}
                    </Badge>
                    <h3 className="text-xl md:text-2xl font-black text-slate-900 leading-normal">
                      {activeQuestion.text}
                    </h3>
                  </div>

                  {/* QUESTION INPUTS RENDERING */}
                  <div className="pt-4 border-t border-slate-100">
                    <AnimatePresence mode="wait">
                      
                      {/* TRUE_FALSE TYPE CONTROL */}
                      {activeQuestion.type === 'TRUE_FALSE' && (
                        <motion.div 
                          key="tf"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                          <button 
                            type="button"
                            onClick={() => selectChoice(activeQuestion.id, 'TRUE')}
                            className={`p-6 rounded-2xl border-2 text-md font-black flex items-center justify-between transition-all outline-none ${answers[activeQuestion.id] === 'TRUE' ? 'border-emerald-500 bg-emerald-50/50 shadow-md ring-2 ring-emerald-400 text-emerald-900' : 'border-slate-200 bg-white hover:border-slate-350 hover:bg-slate-50'}`}
                          >
                            <span>صح / صواب</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${answers[activeQuestion.id] === 'TRUE' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>
                              {answers[activeQuestion.id] === 'TRUE' && <CheckCircle2 size={14} />}
                            </div>
                          </button>

                          <button 
                            type="button"
                            onClick={() => selectChoice(activeQuestion.id, 'FALSE')}
                            className={`p-6 rounded-2xl border-2 text-md font-black flex items-center justify-between transition-all outline-none ${answers[activeQuestion.id] === 'FALSE' ? 'border-rose-500 bg-rose-50/50 shadow-md ring-2 ring-rose-400 text-rose-900' : 'border-slate-200 bg-white hover:border-slate-350 hover:bg-slate-50'}`}
                          >
                            <span>خطأ / غير صحيح</span>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${answers[activeQuestion.id] === 'FALSE' ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300'}`}>
                              {answers[activeQuestion.id] === 'FALSE' && <CheckCircle2 size={14} />}
                            </div>
                          </button>
                        </motion.div>
                      )}

                      {/* MULTIPLE CHOICE CONTROL */}
                      {activeQuestion.type === 'MULTIPLE_CHOICE' && (
                        <motion.div 
                          key="mc"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-4"
                        >
                          {activeQuestion.options?.map((option, idx) => {
                            const isSelected = answers[activeQuestion.id] === option;
                            const optionLetters = ['أ', 'ب', 'ج', 'د'];
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => selectChoice(activeQuestion.id, option)}
                                className={`w-full p-5 rounded-2xl border-2 text-right font-extrabold flex items-center justify-between transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 ring-2 ring-indigo-500 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                    {optionLetters[idx] || (idx + 1)}
                                  </div>
                                  <span className="text-slate-800 text-md">{option}</span>
                                </div>
                                {isSelected && <CheckCircle2 size={18} className="text-indigo-600" />}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}

                      {/* MATCHING CONTROL */}
                      {activeQuestion.type === 'MATCHING' && (
                        <motion.div 
                          key="matching"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-6"
                        >
                          <p className="text-xs text-slate-500 font-bold italic leading-relaxed">يرجى قراءة كل فقرة على اليمين واختيار الفقرة المطابقة المناسبة لها من القائمة المنسدلة على اليسار:</p>
                          <div className="space-y-4">
                            {activeQuestion.matchingPairs?.map((pair, idx) => {
                              const currentSelected = answers[activeQuestion.id]?.[pair.left] || "";
                              const allRights = activeQuestion.matchingPairs?.map(p => p.right) || [];
                              
                              return (
                                <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/40">
                                  <div className="font-bold text-slate-800 text-sm md:w-1/2">
                                    {pair.left}
                                  </div>
                                  <div className="md:w-1/2">
                                    <select
                                      value={currentSelected}
                                      onChange={(e) => selectMatchingChoice(activeQuestion.id, pair.left, e.target.value)}
                                      className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3 font-semibold text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      <option value="">-- اختر التطابق المناسب --</option>
                                      {allRights.map((r, rIdx) => (
                                        <option key={rIdx} value={r}>{r}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}

                      {/* ESSAY TYPE CONTROL */}
                      {activeQuestion.type === 'ESSAY' && (
                        <motion.div 
                          key="essay"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-4"
                        >
                          <Label htmlFor="essay-answer" className="text-xs font-black text-slate-600">أدخل إجابتك الشاملة هنا:</Label>
                          <textarea
                            id="essay-answer"
                            rows={8}
                            placeholder="اكتب إجابتك المقالية بوضوح للتصحيح والتقييم اليدوي اللاحق..."
                            value={String(answers[activeQuestion.id] || "")}
                            onChange={(e) => selectChoice(activeQuestion.id, e.target.value)}
                            className="w-full p-5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-indigo-500 rounded-2xl text-slate-800 font-medium text-sm leading-relaxed"
                          />
                        </motion.div>
                      )}

                    </AnimatePresence>
                  </div>
                </CardContent>

                {/* BOTTOM NAVIGATION DECKS */}
                <CardFooter className="p-8 pt-0 border-t border-slate-100 flex items-center justify-between gap-4">
                  <Button
                    variant="neutral"
                    onClick={prevQuestion}
                    disabled={currentQuestionIdx === 0}
                    className="h-12 border-slate-200 rounded-xl font-bold bg-white text-slate-700 hover:bg-slate-50 gap-2 text-xs"
                  >
                    <ChevronRight size={16} /> السابق
                  </Button>

                  {currentQuestionIdx < activeExam.questions.length - 1 ? (
                    <Button
                      onClick={nextQuestion}
                      className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold gap-2 text-xs"
                    >
                      التالي <ChevronLeft size={16} />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setIsConfirmSubmitOpen(true)}
                      className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black gap-2 text-xs shadow-md shadow-emerald-100"
                    >
                      إنهاء الاختبار وارسال الإجابات <CircleCheck size={16} />
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {/* 5. FINISHED/SUCCESS SCREEN */}
          {view === 'FINISHED' && activeExam && (
            <motion.div
              key="finished"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xl mx-auto"
            >
              <Card className="border-slate-200 shadow-2xl rounded-3xl bg-white overflow-hidden mt-6 text-center">
                <div className="h-4 bg-emerald-500 w-full" />
                <CardContent className="p-10 space-y-6">
                  <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner animate-bounce">
                    <CheckCircle2 size={44} />
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900">تم فحص وتسجيل إجاباتك بنجاح</h2>
                    <p className="text-slate-500 text-sm font-bold">شكرًا لك يا {sessionApp?.fullName} على إنهاء التقييم</p>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-600 leading-relaxed text-right space-y-3">
                    <div className="flex justify-between items-center text-slate-800 font-extrabold pb-2 border-b border-slate-200/60">
                      <span>الاختبار الملغى:</span>
                      <span>{activeExam.title}</span>
                    </div>
                    <div>
                      {activeExam.completionMessage || "تم تصنيف وحفظ الإجابات بمخدم الرصد بنجاح. سنقوم بإكمال تصحيح الجوانب المقالية والعملية وإرسال النتيجة بصفحة نتائجك."}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-10 pt-0">
                  <Button className="w-full h-12 bg-slate-900 hover:bg-black font-black text-xs text-white rounded-xl" onClick={() => setView('LIST')}>
                    العودة لصفحة التقييمات العامة
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* CONFIRMATION SUBMIT DIALOG MODAL */}
      {isConfirmSubmitOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-8 shadow-2xl text-right space-y-6"
          >
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <CircleAlert size={22} className="text-indigo-600" /> اعتماد وإرسال الحلول
              </h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed">
                هل أنت متأكد تماماً من رغبتك في تسليم الحلول وإنهاء هذا التقييم مسبقاً؟ لا يمكنك إطلاقاً التراجع أو إعادة الدخول للاختبار بمجرد اتخاذ هذا القرار.
              </p>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" className="flex-1 h-11 border-slate-200 text-xs font-semibold rounded-xl text-slate-600" onClick={() => setIsConfirmSubmitOpen(false)}>
                تراجع، مواصلة الحل
              </Button>
              <Button className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl" onClick={() => submitExamAnswers(false)}>
                نعم، تسليم وإنهاء الاختبار
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
