/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { storage } from "../lib/storage";
import { getApiUrl } from "../lib/api";
import { Exam, Question, ExamSubmission } from "../types";
import { 
  BookOpen, Plus, Trash2, Save, FileType, CheckCircle, PenTool, 
  MessageCircle, Star, Edit2, Copy, Clock, UploadCloud, DownloadCloud, 
  AlertTriangle, Settings2, Sparkles, FileSpreadsheet, X, Eye, EyeOff,
  Calendar, Check, Settings, Layers, HelpCircle, ArrowRight, ChevronRight,
  Play, CheckSquare, RefreshCw, CalendarDays, Heading, MessageSquarePlus,
  ArrowUp, ArrowDown, Users
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import GraderDashboard from "./GraderDashboard";

export default function ExamManager() {
  const [exams, setExams] = useState<Exam[]>(storage.getExams());
  const [submissions, setSubmissions] = useState<ExamSubmission[]>(storage.getSubmissions());
  const [apps, setApps] = useState<any[]>(storage.getApplications());
  const [trackingExamId, setTrackingExamId] = useState<string>("all");
  const [trackingSelectedSub, setTrackingSelectedSub] = useState<ExamSubmission | null>(null);
  const [trackingScores, setTrackingScores] = useState<Record<string, number>>({});
  const [trackingComments, setTrackingComments] = useState<Record<string, string>>({});

  const [currentExam, setCurrentExam] = useState<Partial<Exam>>({ 
    title: '', 
    questions: [],
    visible: true,
    timingMode: 'QUESTION',
    globalTimeLimit: 1800,
    questionsPerPage: 1,
    welcomeMessage: 'مرحباً بك في الاختبار الإلكتروني. الرجاء التركيز وقراءة الأسئلة بعناية.',
    completionMessage: 'تم الانتهاء من الاختبار بنجاح. شكراً لك وسيتم إعلان النتيجة قريباً.'
  });
  const [view, setView] = useState<'LIST' | 'CREATE' | 'GRADE'>('LIST');
  const [selectedSubmission, setSelectedSubmission] = useState<ExamSubmission | null>(null);

  // Wizard / Creation state
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [creationMethod, setCreationMethod] = useState<'MANUAL' | 'UPLOAD' | 'AI'>('MANUAL');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [totalQuestionsCount, setTotalQuestionsCount] = useState<number>(5);
  
  // Custom blocks setup for manual creation
  const [configBlocks, setConfigBlocks] = useState<any[]>([
    { id: '1', type: 'MULTIPLE_CHOICE', itemCount: 2, pointsPerItem: 5, timeLimit: 60 },
    { id: '2', type: 'TRUE_FALSE', itemCount: 2, pointsPerItem: 5, timeLimit: 45 },
    { id: '3', type: 'ESSAY', itemCount: 1, pointsPerItem: 10, timeLimit: 300 },
  ]);

  // Inline rename & scheduling states in list view
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editingExamTitle, setEditingExamTitle] = useState<string>('');
  const [schedulingExamId, setSchedulingExamId] = useState<string | null>(null);
  const [schedStartDate, setSchedStartDate] = useState<string>('');
  const [schedStartTime, setSchedStartTime] = useState<string>('');
  const [schedEndDate, setSchedEndDate] = useState<string>('');
  const [schedEndTime, setSchedEndTime] = useState<string>('');

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      await storage.init();
      setExams(storage.getExams());
      setSubmissions(storage.getSubmissions());
      setApps(storage.getApplications());
    };
    initialize();
  }, []);

  // Sync exams wrapper
  const refreshList = () => {
    setExams(storage.getExams());
    setSubmissions(storage.getSubmissions());
    setApps(storage.getApplications());
  };

  // Clone an existing Exam
  const cloneExam = async (exam: Exam) => {
    const clone: Exam = {
      ...exam,
      id: crypto.randomUUID(),
      title: `نسخة من - ${exam.title}`,
    };
    await storage.saveExam(clone);
    refreshList();
    toast.success("تم استنساخ الاختبار بنجاح");
  };

  // Toggle Visibility
  const toggleVisibility = async (exam: Exam) => {
    const updated: Exam = {
      ...exam,
      visible: exam.visible === false ? true : false
    };
    await storage.saveExam(updated);
    refreshList();
    toast.success(updated.visible ? "الاختبار مرئي الآن للطلاب" : "تم إخفاء الاختبار عن الطلاب");
  };

  // Inline rename save
  const saveRename = async (exam: Exam) => {
    if (!editingExamTitle.trim()) {
      toast.error("العنوان لا يمكن أن يكون فارغاً");
      return;
    }
    const updated: Exam = {
      ...exam,
      title: editingExamTitle.trim()
    };
    await storage.saveExam(updated);
    refreshList();
    setEditingExamId(null);
    toast.success("تم تعديل الاسم بنجاح");
  };

  // Scheduling save
  const saveScheduling = async (exam: Exam) => {
    const updated: Exam = {
      ...exam,
      startDate: schedStartDate || undefined,
      startTime: schedStartTime || undefined,
      endDate: schedEndDate || undefined,
      endTime: schedEndTime || undefined,
    };
    await storage.saveExam(updated);
    refreshList();
    setSchedulingExamId(null);
    toast.success("تم تحديث مواعيد الجدولة الزمنية بنجاح");
  };

  // Delete exam
  const deleteExam = async (id: string) => {
    await storage.deleteExam(id);
    refreshList();
    toast.info("تم حذف الاختبار بنجاح");
  };

  // Block handlers
  const addBlock = () => {
    setConfigBlocks([
      ...configBlocks,
      { id: crypto.randomUUID(), type: 'MULTIPLE_CHOICE', itemCount: 1, pointsPerItem: 5, timeLimit: 60 }
    ]);
  };

  const removeBlock = (id: string) => {
    setConfigBlocks(configBlocks.filter(b => b.id !== id));
  };

  const updateBlock = (id: string, updates: any) => {
    setConfigBlocks(configBlocks.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  // Calculate sum of items in config blocks
  const allocatedQuestionsCount = configBlocks.reduce((acc, b) => acc + (parseInt(b.itemCount) || 0), 0);

  const getArabicOrdinal = (n: number): string => {
    const ordinals = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر"];
    return ordinals[n - 1] || `${n}`;
  };

  const moveQuestion = (qIdx: number, direction: 'UP' | 'DOWN') => {
    setCurrentExam(prev => {
      if (!prev.questions) return prev;
      const list = [...prev.questions];
      if (direction === 'UP' && qIdx > 0) {
        const temp = list[qIdx];
        list[qIdx] = list[qIdx - 1];
        list[qIdx - 1] = temp;
      } else if (direction === 'DOWN' && qIdx < list.length - 1) {
        const temp = list[qIdx];
        list[qIdx] = list[qIdx + 1];
        list[qIdx + 1] = temp;
      }
      return { ...prev, questions: list };
    });
    toast.success("تم تغيير ترتيب السؤال بنجاح");
  };

  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);

  // Group questions by type and block logic for better systematic viewing
  const groupQuestionsByType = () => {
    setCurrentExam(prev => {
      if (!prev.questions || prev.questions.length === 0) return prev;
      
      const typeOrder = ['TRUE_FALSE', 'MULTIPLE_CHOICE', 'MATCHING', 'ESSAY'];
      
      const sorted = [...prev.questions].sort((a, b) => {
        return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
      });
      
      const counts: Record<string, number> = {};
      const blockOrder = configBlocks.map(b => b.type);
      const getBlockIndex = (type: string) => {
        const idx = blockOrder.indexOf(type);
        return idx !== -1 ? idx : typeOrder.indexOf(type);
      };
      
      const updated = sorted.map(q => {
        if (!counts[q.type]) counts[q.type] = 0;
        counts[q.type]++;
        
        const blockIdx = getBlockIndex(q.type);
        const ordinal = getArabicOrdinal(blockIdx + 1);
        const typeLabel = q.type === 'TRUE_FALSE' ? 'صح/خطأ' : q.type === 'MULTIPLE_CHOICE' ? 'متعدد' : q.type === 'MATCHING' ? 'مزاوجة' : 'مقالي';
        
        // Update styling layout so questions look like "السؤال الأول (صح/خطأ) - فقرة ١"
        if (!q.text || q.text.startsWith('السؤال') || q.text.startsWith('قالب')) {
          return {
            ...q,
            text: `السؤال ${ordinal} (${typeLabel}) - فقرة ${counts[q.type]}`
          };
        }
        return q;
      });
      
      return { ...prev, questions: updated };
    });
    toast.success("تم فرز وترتيب وتجميع الأسئلة حسب النوع بنجاح");
  };

  // AI Generation Handler
  const handleAiGeneration = async () => {
    if (!aiPrompt.trim() && !aiFile) {
      toast.error("يرجى إدخال موضوع أو رفع ملف للمنهج");
      return;
    }

    try {
      setIsGenerating(true);
      
      let fileData: string | null = null;
      let mimeType: string | null = null;

      if (aiFile) {
        mimeType = aiFile.type;
        // If it's a Google Drive file, it might be a different object or path
        // But for now, we assume local file or base64 from Drive
        if ((aiFile as any).driveId) {
          const { getAccessToken } = await import("../lib/googleAuth");
          const token = await getAccessToken();
          if (!token) throw new Error("يرجى تسجيل الدخول بحساب Google أولاً");
          
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${(aiFile as any).driveId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const blob = await response.blob();
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
          });
          reader.readAsDataURL(blob);
          fileData = await base64Promise;
        } else {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
          });
          reader.readAsDataURL(aiFile);
          fileData = await base64Promise;
        }
      }

      const response = await fetch(getApiUrl("/api/generate-exam"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          fileData,
          mimeType,
          structure: configBlocks
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "فشل توليد الاختبار");
      }

      const data = await response.json();
      
      const questionsWithIds = data.questions.map((q: any) => ({
        ...q,
        id: crypto.randomUUID()
      }));

      setCurrentExam(prev => ({
        ...prev,
        title: data.title || aiPrompt.substring(0, 50) || "اختبار مولد ذكياً",
        questions: questionsWithIds
      }));

      setWizardStep(4);
      toast.success("تم توليد الاختبار بنجاح بواسطة الذكاء الاصطناعي!");
    } catch (err: any) {
      console.error(err);
      toast.error(`خطأ: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchDriveFiles = async () => {
    try {
      setIsLoadingDrive(true);
      const { getAccessToken } = await import("../lib/googleAuth");
      const token = await getAccessToken();
      if (!token) {
        toast.error("يرجى ربط حساب Google أولاً من الإعدادات");
        return;
      }

      const response = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType="application/pdf" or mimeType contains "image/"&fields=files(id, name, mimeType)', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.files) {
        setDriveFiles(data.files);
        setIsDrivePickerOpen(true);
      }
    } catch (err) {
      console.error(err);
      toast.error("فشل جلب ملفات Google Drive");
    } finally {
      setIsLoadingDrive(false);
    }
  };

  // Generate structure...
  const generateQuestionsFromBlocks = () => {
    if (!currentExam.title?.trim()) {
      toast.error("يرجى إدخال عنوان الاختبار أولاً");
      setWizardStep(2);
      return;
    }

    const generatedQuestions: Question[] = [];
    configBlocks.forEach((block, blockIndex) => {
      const type = block.type as Question['type'];
      const itemCount = parseInt(block.itemCount) || 1;
      const points = parseInt(block.pointsPerItem) || 5;
      const timeLimit = parseInt(block.timeLimit) || 60;

      for (let i = 0; i < itemCount; i++) {
        const ordinal = getArabicOrdinal(blockIndex + 1);
        const typeLabel = type === 'TRUE_FALSE' ? 'صح/خطأ' : type === 'MULTIPLE_CHOICE' ? 'متعدد' : type === 'MATCHING' ? 'مزاوجة' : 'مقالي';
        const q: Question = {
          id: crypto.randomUUID(),
          type,
          text: `السؤال ${ordinal} (${typeLabel}) - فقرة ${i + 1}`,
          points,
          timeLimit: currentExam.timingMode === 'QUESTION' ? timeLimit : undefined,
          options: type === 'MULTIPLE_CHOICE' ? ['الخيار ١', 'الخيار ٢', 'الخيار ٣', 'الخيار ٤'] : undefined,
          matchingPairs: type === 'MATCHING' ? [
            { left: 'الفقرة أ', right: 'الفقرة ب' },
            { left: 'الفقرة ج', right: 'الفقرة د' }
          ] : undefined,
        };
        generatedQuestions.push(q);
      }
    });

    setCurrentExam(prev => ({
      ...prev,
      questions: generatedQuestions
    }));
    setWizardStep(4);
    toast.success(`تم توليد ${generatedQuestions.length} سؤال بنجاح حسب الهيكل`);
  };

  // Import / Export helpers from original logic
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const allQuestions: Question[] = [];

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(ws) as any[];

          data.forEach(item => {
            const rowType = (sheetName.toUpperCase().includes('TF') || item.Type === 'TF') ? 'TRUE_FALSE' :
                           (sheetName.toUpperCase().includes('MC') || item.Type === 'MC') ? 'MULTIPLE_CHOICE' :
                           (sheetName.toUpperCase().includes('MAT') || item.Type === 'MAT') ? 'MATCHING' : 
                           (sheetName.toUpperCase().includes('ESSAY') || item.Type === 'ESSAY') ? 'ESSAY' : 'MULTIPLE_CHOICE';

            const q: Question = {
              id: crypto.randomUUID(),
              type: rowType as Question['type'],
              text: item.Question || item.Text || (rowType === 'MATCHING' ? 'سؤال مطابقة' : 'سؤال جديد'),
              points: Number(item.Points || 5),
              timeLimit: Number(item.Time || 60),
            };

            if (rowType === 'TRUE_FALSE') {
              const ans = String(item.CorrectAnswer || item['الإجابة'] || '');
              q.correctAnswer = (ans === 'صح' || ans === 'TRUE' || ans === '1') ? 'TRUE' : 'FALSE';
            } else if (rowType === 'MULTIPLE_CHOICE') {
              q.options = [
                String(item.A || item['أ'] || ''),
                String(item.B || item['ب'] || ''),
                String(item.C || item['ج'] || ''),
                String(item.D || item['د'] || '')
              ].filter(Boolean);
              q.correctAnswer = String(item.CorrectAnswer || item['الإجابة'] || '');
            }

            if (rowType !== 'MATCHING') {
              allQuestions.push(q);
            }
          });

          if (sheetName.toUpperCase().includes('MAT')) {
            const pairs = data.slice(0, 5).map(item => ({
              left: String(item.A || ''),
              right: String(item.B || '')
            })).filter(p => p.left || p.right);
            
            if (pairs.length > 0) {
              allQuestions.push({
                id: crypto.randomUUID(),
                type: 'MATCHING',
                text: 'صل بين العمودين التاليين:',
                points: 10,
                timeLimit: 120,
                matchingPairs: pairs
              });
            }
          }
        });

        setCurrentExam(prev => ({
          ...prev,
          questions: [...(prev.questions || []), ...allQuestions]
        }));
        setWizardStep(4); // Advance directly to Editor
        toast.success(`تم استيراد ${allQuestions.length} سؤال بنجاح من Excel`);
      } catch (err) {
        toast.error("خطأ في قراءة ملف Excel");
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadExcelTemplate = () => {
    const wb = XLSX.utils.book_new();

    const tfData = [
      { Index: 1, Question: 'الأرض كروية الشكل', Points: 5, Time: 30, CorrectAnswer: 'صح' },
      { Index: 2, Question: 'الشمس تدور حول الأرض', Points: 5, Time: 30, CorrectAnswer: 'خطأ' }
    ];
    const tfWs = XLSX.utils.json_to_sheet(tfData);
    XLSX.utils.book_append_sheet(wb, tfWs, "TF_TrueFalse");

    const mcData = [
      { Index: 1, Question: 'ما هي عاصمة السعودية؟', A: 'جدة', B: 'الرياض', C: 'الدمام', D: 'مكة', CorrectAnswer: 'الرياض', Points: 5, Time: 60 }
    ];
    const mcWs = XLSX.utils.json_to_sheet(mcData);
    XLSX.utils.book_append_sheet(wb, mcWs, "MC_MultipleChoice");

    const matData = [
       { A: 'الكويت', B: 'مسقط', Answer: 'الكويت' },
       { A: 'عمان', B: 'المنامة', Answer: 'مسقط' },
       { A: 'البحرين', B: 'الكويت', Answer: 'المنامة' },
       { A: 'الإمارات', B: 'أبوظبي', Answer: 'أبوظبي' },
       { A: 'قطر', B: 'الدوحة', Answer: 'الدوحة' }
    ];
    const matWs = XLSX.utils.json_to_sheet(matData);
    XLSX.utils.book_append_sheet(wb, matWs, "MAT_Matching");

    const essayData = [
      { Index: 1, Question: 'اكتب مقالاً قصيراً عن رؤية 2030', Points: 10, Time: 600 }
    ];
    const essayWs = XLSX.utils.json_to_sheet(essayData);
    XLSX.utils.book_append_sheet(wb, essayWs, "ESSAY_Questions");

    XLSX.writeFile(wb, "exam_templates_master.xlsx");
    toast.success("تم تحميل قالب إكسيل بجميع النماذج");
  };

  const exportToExcel = () => {
    if (!currentExam.questions?.length) {
      toast.error("لا توجد أسئلة للتصدير");
      return;
    }

    const exportData = currentExam.questions.map((q, idx) => ({
      Index: idx + 1,
      Type: q.type,
      Text: q.text,
      Points: q.points,
      Time: q.timeLimit || '',
      Options: q.options?.join(';'),
      CorrectAnswer: q.correctAnswer
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, `${currentExam.title || 'exam'}_questions.xlsx`);
    toast.success("تم تصدير الأسئلة إلى Excel بنجاح");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
           setCurrentExam(prev => ({ ...prev, questions: [...(prev.questions || []), ...json] }));
           setWizardStep(4);
           toast.success("تم تحميل الأسئلة من JSON وطبقناها في محرر الأسئلة");
        }
      } catch (err) {
        toast.error("ملف JSON غير صالح");
      }
    };
    reader.readAsText(file);
  };

  const exportExams = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentExam.questions || []));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `exam_questions_${currentExam.title || 'untitled'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("تم تصدير الأسئلة حالياً بصيغة JSON");
  };

  // Detailed Questions Editor helpers
  const addQuestion = (type: Question['type']) => {
    const newQ: Question = {
      id: crypto.randomUUID(),
      type,
      text: '',
      points: 5,
      timeLimit: currentExam.timingMode === 'QUESTION' ? 60 : undefined,
      options: type === 'MULTIPLE_CHOICE' ? ['', '', '', ''] : undefined,
      matchingPairs: type === 'MATCHING' ? [{ left: '', right: '' }] : undefined,
    };
    setCurrentExam(prev => ({ ...prev, questions: [...(prev.questions || []), newQ] }));
  };

  const copyQuestion = (q: Question) => {
    const newQ = { ...q, id: crypto.randomUUID() };
    setCurrentExam(prev => ({ ...prev, questions: [...(prev.questions || []), newQ] }));
    toast.success("تم تكرار السؤال");
  };

  const removeQuestion = (id: string) => {
    setCurrentExam(prev => ({
      ...prev,
      questions: prev.questions?.filter(q => q.id !== id)
    }));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setCurrentExam(prev => ({
      ...prev,
      questions: prev.questions?.map(q => q.id === id ? { ...q, ...updates } : q)
    }));
  };

  // Save the complete Exam structure
  const saveFinalExam = async () => {
    if (!currentExam.title?.trim() || !currentExam.questions?.length) {
      toast.error("يرجى إكمال عنوان الاختبار وإضافة سؤال واحد على الأقل");
      return;
    }

    const exam: Exam = {
      id: currentExam.id || crypto.randomUUID(),
      title: currentExam.title!,
      questions: currentExam.questions as Question[],
      totalPoints: currentExam.questions!.reduce((acc, q) => acc + q.points, 0),
      visible: currentExam.visible !== undefined ? currentExam.visible : true,
      timingMode: currentExam.timingMode,
      globalTimeLimit: currentExam.globalTimeLimit,
      questionsPerPage: currentExam.questionsPerPage,
      welcomeMessage: currentExam.welcomeMessage,
      completionMessage: currentExam.completionMessage,
      startDate: currentExam.startDate,
      startTime: currentExam.startTime,
      endDate: currentExam.endDate,
      endTime: currentExam.endTime
    };

    await storage.saveExam(exam);
    await storage.initializeResultsSheet(exam.id, exam.title);
    refreshList();
    setView('LIST');
    toast.success("تم حفظ واعتماد التقييم النهائي بنجاح");
  };

  // Grade submission logic (retained perfectly)
  const gradeSubmission = async (submissionId: string, qId: string, score: number, comment: string) => {
    const sub = submissions.find(s => s.id === submissionId);
    if (!sub) return;
    
    const updatedGrades = { ...sub.grades, [qId]: { score, comment } };
    const updatedSub: ExamSubmission = { ...sub, grades: updatedGrades, status: 'GRADED' };
    
    await storage.saveSubmission(updatedSub);
    setSubmissions(storage.getSubmissions());
    setSelectedSubmission(updatedSub);
    toast.success("تم حفظ الدرجة للمقال المراجع بنجاح");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Settings className="text-indigo-600 animate-spin-slow" size={28} />
            منصة تصميم وإدارة الاختبارات الذكية
          </h1>
          <p className="text-sm text-slate-500 font-bold mt-1">
            صياغة الامتحانات التفاعلية، تصنيف الأسئلة وتصحيح المقالي بالجدولة التلقائية المتقدمة.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {view !== 'LIST' && (
            <Button variant="outline" size="sm" onClick={() => setView('LIST')} className="text-xs h-10 font-bold border-slate-200 hover:bg-slate-50 gap-1 flex items-center">
              <ChevronRight size={14} /> عودة لقائمة الاختبارات
            </Button>
          )}

          {view === 'LIST' && (
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline"
                onClick={() => { setCreationMethod('MANUAL'); setWizardStep(2); setView('CREATE'); }}
                className="border-indigo-200 text-indigo-700 h-9 px-4 rounded-xl text-[10px] font-black hover:bg-indigo-50"
              >
                <PenTool size={14} className="ml-1.5" /> إنشاء اختبار
              </Button>
              <Button 
                variant="outline"
                onClick={() => { setCreationMethod('UPLOAD'); setWizardStep(2); setView('CREATE'); }}
                className="border-emerald-200 text-emerald-700 h-9 px-4 rounded-xl text-[10px] font-black hover:bg-emerald-50"
              >
                <FileSpreadsheet size={14} className="ml-1.5" /> إنشاء اختبار من ملف
              </Button>
              <Button 
                variant="outline"
                onClick={() => { setCreationMethod('AI'); setWizardStep(1.5); setView('CREATE'); }}
                className="border-purple-200 text-purple-700 h-9 px-4 rounded-xl text-[10px] font-black hover:bg-purple-50"
              >
                <Sparkles size={14} className="ml-1.5" /> إنشاء اختبار بالذكاء الاصطناعي
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* VIEW: MAIN LIST OF QUIZZES */}
      {view === 'LIST' && (
        <div className="space-y-4">
          {/* Prominent three-column Bento Grid of creation methods */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Manual */}
            <Card className="shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 border border-slate-200/60 rounded-2xl overflow-hidden cursor-pointer bg-white group"
              onClick={() => { setCreationMethod('MANUAL'); setWizardStep(2); setView('CREATE'); }}
            >
              <div className="p-5 flex items-start gap-4">
                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white shrink-0">
                  <PenTool size={18} />
                </div>
                <div className="space-y-1 text-right">
                  <h3 className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition-colors">صياغة اختبار يدوي</h3>
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed">أدخل الأسئلة والخيارات والملاحظات يدوياً خطوة بخطوة.</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-600 pt-1">
                    ابدأ التصميم <ChevronRight size={10} className="rotate-180" />
                  </span>
                </div>
              </div>
            </Card>

            {/* Card 2: Excel Import */}
            <Card className="shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 border border-slate-200/60 rounded-2xl overflow-hidden cursor-pointer bg-white group"
              onClick={() => { setCreationMethod('UPLOAD'); setWizardStep(2); setView('CREATE'); }}
            >
              <div className="p-5 flex items-start gap-4">
                <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white shrink-0">
                  <FileSpreadsheet size={18} />
                </div>
                <div className="space-y-1 text-right">
                  <h3 className="text-xs font-black text-slate-800 group-hover:text-emerald-600 transition-colors">استيراد من Excel</h3>
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed">ارفع جدول الأسئلة دفعة واحدة وتلقائياً بالكامل في ثوانٍ.</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-600 pt-1">
                    رفع الجدول <ChevronRight size={10} className="rotate-180" />
                  </span>
                </div>
              </div>
            </Card>

            {/* Card 3: AI Generation */}
            <Card className="shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 border border-slate-200/60 rounded-2xl overflow-hidden cursor-pointer bg-white group"
              onClick={() => { setCreationMethod('AI'); setWizardStep(1.5); setView('CREATE'); }}
            >
              <div className="p-5 flex items-start gap-4">
                <div className="p-3 bg-purple-50 rounded-xl text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white shrink-0">
                  <Sparkles size={18} />
                </div>
                <div className="space-y-1 text-right">
                  <h3 className="text-xs font-black text-slate-800 group-hover:text-purple-600 transition-colors">توليد بالذكاء الاصطناعي (AI)</h3>
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed">أدخل المادة العلمية التخصصية ودع المحرك يصيغ الأسئلة.</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-black text-purple-600 pt-1">
                    التوليد الذكي <ChevronRight size={10} className="rotate-180" />
                  </span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
          {/* Right column: Exams listings (takes 2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="shadow-md border-slate-200/60 rounded-2xl overflow-hidden">
              <CardHeader className="py-5 bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-base font-black flex items-center justify-between text-slate-800">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-500" />
                    التقييمات الحالية في البوابة
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">{exams.length} اختبارات</Badge>
                </CardTitle>
                <CardDescription className="text-xs font-bold text-slate-400">
                  انقر على أدوات التحكم لتحديث حالة الظهور والجدولة الزمنية وتعديل ومضاعفة الاختبار.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {exams.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-20 text-slate-300">
                     <BookOpen size={48} className="mb-4 opacity-20 text-slate-400" />
                     <p className="text-sm font-black text-slate-400">لا توجد أي اختبارات منشأة حتى الآن</p>
                     <p className="text-xs text-slate-400 font-bold mt-1">ابدأ بإنشاء أول اختبار باستخدام المعالج المتقدم.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {exams.map(exam => {
                      const isScheduleSet = exam.startDate || exam.endDate;
                      return (
                        <div key={exam.id} className="p-5 hover:bg-slate-50/50 transition-all flex flex-col gap-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            {/* Stats and titles */}
                            <div className="flex items-start gap-3 flex-1">
                              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                                <BookOpen size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                {editingExamId === exam.id ? (
                                  <div className="flex items-center gap-2 max-w-md">
                                    <Input 
                                      className="text-xs h-8 focus-visible:ring-indigo-600"
                                      value={editingExamTitle}
                                      onChange={(e) => setEditingExamTitle(e.target.value)}
                                    />
                                    <Button variant="default" size="sm" className="h-8 text-[11px] font-bold bg-indigo-600 text-white" onClick={() => saveRename(exam)}>
                                      حفظ
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-slate-400" onClick={() => setEditingExamId(null)}>
                                      إلغاء
                                    </Button>
                                  </div>
                                ) : (
                                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 truncate">
                                    {exam.title}
                                    {exam.visible === false && (
                                      <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none text-[9px] h-4">مخفي</Badge>
                                    )}
                                    {exam.visible !== false && (
                                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border-none text-[9px] h-4">مرئي</Badge>
                                    )}
                                  </h3>
                                )}
                                
                                <div className="flex flex-wrap gap-2 sm:gap-4 items-center mt-2">
                                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                                    <CheckSquare size={12} className="text-slate-400" /> {exam.questions?.length || 0} أسئلة
                                  </span>
                                  <span className="text-slate-200">|</span>
                                  <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                                    <Star size={12} className="text-amber-500 fill-amber-500" /> {exam.totalPoints} درجات
                                  </span>
                                  {isScheduleSet && (
                                    <>
                                      <span className="text-slate-200">|</span>
                                      <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1">
                                        <CalendarDays size={12} className="text-indigo-500" /> مجدول للظهور
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions toolbar */}
                            <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                              {/* Visibility Toggle */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className={`h-8 w-8 rounded-lg ${exam.visible === false ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-emerald-500 hover:text-slate-400 hover:bg-slate-100'}`}
                                onClick={() => toggleVisibility(exam)}
                                title={exam.visible === false ? "جعل الاختبار مرئياً" : "إخفاء الاختبار"}
                              >
                                {exam.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                              </Button>

                              {/* Rename */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => { setEditingExamId(exam.id); setEditingExamTitle(exam.title); }}
                                title="إعادة تسمية"
                              >
                                <Edit2 size={13} />
                              </Button>

                              {/* Duplicate */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                onClick={() => cloneExam(exam)}
                                title="استنساخ / تكرار"
                              >
                                <Copy size={13} />
                              </Button>

                              {/* Jodolat Al Test */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                onClick={() => {
                                  setSchedulingExamId(schedulingExamId === exam.id ? null : exam.id);
                                  setSchedStartDate(exam.startDate || '');
                                  setSchedStartTime(exam.startTime || '');
                                  setSchedEndDate(exam.endDate || '');
                                  setSchedEndTime(exam.endTime || '');
                                }}
                                title="جدولة العرض والإخفاء"
                              >
                                <CalendarDays size={14} />
                              </Button>

                              {/* Edit details */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-indigo-500 hover:bg-indigo-50" 
                                onClick={() => { 
                                  setCurrentExam(exam); 
                                  setWizardStep(4); // Advance directly to Questions content editor in Wizard
                                  setView('CREATE'); 
                                }}
                                title="تحرير الأسئلة والخيارات"
                              >
                                <Settings2 size={14} />
                              </Button>

                              {/* View Submissions / Grade */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-emerald-600 hover:bg-emerald-50" 
                                onClick={() => { 
                                  setSelectedSubmission(null); 
                                  setView('GRADE'); 
                                }}
                                title="متابعة الاختبار والدرجات"
                              >
                                <Users size={14} />
                              </Button>

                              {/* Delete */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                                onClick={() => deleteExam(exam.id)}
                                title="حذف بالكامل"
                              >
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </div>

                          {/* Expansion block for Scheduling setup */}
                          {schedulingExamId === exam.id && (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 animate-in slide-in-from-top-3 duration-200 space-y-3">
                              <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                <CalendarDays size={14} className="text-amber-500" />
                                ضبط أوقات الظهور والاختفاء التلقائي للاختبار
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                  <Label className="text-[10px] text-slate-500 font-bold">بداية العرض (تاريخ)</Label>
                                  <Input 
                                    type="date" 
                                    value={schedStartDate} 
                                    onChange={(e) => setSchedStartDate(e.target.value)} 
                                    className="h-8 text-xs bg-white text-right font-mono"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] text-slate-500 font-bold">وقت البدء</Label>
                                  <Input 
                                    type="time" 
                                    value={schedStartTime} 
                                    onChange={(e) => setSchedStartTime(e.target.value)} 
                                    className="h-8 text-xs bg-white text-right font-mono"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] text-slate-500 font-bold">نهاية العرض (تاريخ)</Label>
                                  <Input 
                                    type="date" 
                                    value={schedEndDate} 
                                    onChange={(e) => setSchedEndDate(e.target.value)} 
                                    className="h-8 text-xs bg-white text-right font-mono"
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] text-slate-500 font-bold">وقت الإخفاء</Label>
                                  <Input 
                                    type="time" 
                                    value={schedEndTime} 
                                    onChange={(e) => setSchedEndTime(e.target.value)} 
                                    className="h-8 text-xs bg-white text-right font-mono"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                                <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setSchedulingExamId(null)}>إغلاق</Button>
                                <Button size="sm" className="h-7 text-[10px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-4" onClick={() => saveScheduling(exam)}>
                                  حفظ واعتماد الجدولة
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Left Column: Student Answers Review & Tracking */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="shadow-md border-slate-200/60 rounded-2xl overflow-hidden bg-white text-right">
              <CardHeader className="py-4 bg-slate-50 border-b border-slate-100 space-y-2">
                <CardTitle className="text-sm font-black flex items-center gap-2 text-slate-800">
                  <Layers size={16} className="text-indigo-600 animate-pulse" />
                  متابعة إيجازات وإجابات الطلاب
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-400 font-bold leading-relaxed">
                  اختر الاختبار لمتابعة ورصد إجابات الطلاب المسلمة مباشرة.
                </CardDescription>
                
                {/* Exam selector */}
                <div className="pt-1">
                  <Select value={trackingExamId} onValueChange={setTrackingExamId}>
                    <SelectTrigger className="w-full h-8 text-[11px] font-bold bg-white text-indigo-700 border-slate-200">
                      <SelectValue placeholder="اختر اختباراً للمتابعة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs font-bold text-slate-800">كل الاختبارات المنشورة</SelectItem>
                      {exams.map(e => (
                        <SelectItem key={e.id} value={e.id} className="text-xs font-bold text-slate-800">{e.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              
              <CardContent className="p-0 max-h-[480px] overflow-auto divide-y divide-slate-100">
                {(() => {
                  const filtered = trackingExamId === "all"
                    ? submissions
                    : submissions.filter(s => s.examId === trackingExamId);

                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-12 text-slate-300 text-center space-y-1">
                        <CheckCircle className="opacity-20 text-slate-400" size={32} />
                        <p className="text-xs font-black text-slate-400">لا توجد إجابات مرسلة حالياً</p>
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-slate-100">
                      {filtered.map(sub => {
                        const studentName = apps.find(a => a.id === sub.studentId)?.fullName || "طالب مجهول";
                        const examTitle = exams.find(e => e.id === sub.examId)?.title || "نموذج عام";
                        return (
                          <div key={sub.id} className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 text-right">
                                <h4 className="text-xs font-black text-slate-900 leading-none">{studentName}</h4>
                                <p className="text-[9px] text-slate-400 font-bold leading-none mt-1">{examTitle}</p>
                              </div>
                              <Badge className={`text-[9px] h-4 font-bold ${sub.status === 'GRADED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`} variant="outline">
                                {sub.status === 'GRADED' ? 'رُصدت' : 'بانتظار المقالي'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-100/55">
                              <span className="text-[9px] text-slate-400 font-mono">#{sub.id.substring(0, 6)}</span>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 text-[10px] font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 px-3 rounded-lg"
                                onClick={() => {
                                  // Initialize grading states for popup
                                  const associatedExam = exams.find(e => e.id === sub.examId);
                                  const initialScores: Record<string, number> = {};
                                  const initialComments: Record<string, string> = {};
                                  if (associatedExam) {
                                    associatedExam.questions.forEach(q => {
                                      if (q.type === 'ESSAY') {
                                        const scoreObj = sub.grades[q.id];
                                        initialScores[q.id] = scoreObj ? scoreObj.score : 0;
                                        initialComments[q.id] = scoreObj ? scoreObj.comment : "";
                                      }
                                    });
                                  }
                                  setTrackingScores(initialScores);
                                  setTrackingComments(initialComments);
                                  setTrackingSelectedSub(sub);
                                }}
                              >
                                عرض الإجابة والتقدير &larr;
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      )}

      {/* Interactive Review & Hand-Grading Modal */}
      <Dialog open={!!trackingSelectedSub} onOpenChange={(open) => { if (!open) setTrackingSelectedSub(null); }}>
        <DialogContent dir="rtl" className="sm:max-w-3xl max-h-[85vh] overflow-y-auto bg-white rounded-3xl p-6 shadow-2xl">
          {trackingSelectedSub && (() => {
            const studentApp = apps.find(a => a.id === trackingSelectedSub.studentId);
            const studentName = studentApp?.fullName || trackingSelectedSub.studentId;
            const studentNationalId = studentApp?.nationalId || "غير متوفر";
            const examId = trackingSelectedSub.examId;
            const associatedExam = exams.find(e => e.id === examId);
            
            if (!associatedExam) {
              return <p className="text-center font-bold text-xs p-6">عذراً، لم نجد اختباراً مطابقاً لهذه الإجابة.</p>;
            }
            
            const handleSaveTrackingGrade = async () => {
              // Recompute all grades
              const updatedGrades = { ...trackingSelectedSub.grades };
              let essaySum = 0;
              let autoSum = 0;
              
              associatedExam.questions.forEach(q => {
                if (q.type === 'ESSAY') {
                  const score = Number(trackingScores[q.id] || 0);
                  const comment = trackingComments[q.id] || "تم التقييم يدوياً من الإدارة";
                  updatedGrades[q.id] = { score, comment };
                  essaySum += score;
                } else {
                  autoSum += (trackingSelectedSub.grades[q.id]?.score || 0);
                }
              });
              
              const finalTotal = autoSum + essaySum;
              const updatedSubmission: ExamSubmission = {
                ...trackingSelectedSub,
                grades: updatedGrades,
                totalGrade: finalTotal,
                status: 'GRADED'
              };
              
              await storage.saveSubmission(updatedSubmission);
              
              // Write to unified answers log sheet
              const breakdown: Record<string, number> = {};
              Object.entries(updatedGrades).forEach(([qid, gr]) => {
                const g = gr as { score: number; comment: string };
                breakdown[qid] = g ? g.score : 0;
              });
              
              const resultsRow = {
                id: trackingSelectedSub.id,
                studentId: trackingSelectedSub.studentId,
                studentName,
                nationalId: studentNationalId,
                examId,
                examTitle: associatedExam.title,
                autoQuizzesScore: autoSum,
                essayScore: essaySum,
                totalScore: finalTotal,
                status: 'GRADED',
                submittedAt: new Date().toISOString(),
                gradesBreakdown: breakdown
              };
              
              await storage.addResultRow(examId, resultsRow as any);
              
              // Sync local state
              setSubmissions(storage.getSubmissions());
              setTrackingSelectedSub(null);
              toast.success("تم رصد وحفظ درجات الطالب، واعتماد النتيجة بنجاح!");
            };
            
            const getAutoScore = () => {
              let sum = 0;
              associatedExam.questions.forEach(q => {
                if (q.type !== 'ESSAY') {
                  sum += (trackingSelectedSub.grades[q.id]?.score || 0);
                }
              });
              return sum;
            };

            const getEssayScore = () => {
              let sum = 0;
              associatedExam.questions.forEach(q => {
                if (q.type === 'ESSAY') {
                  sum += Number(trackingScores[q.id] || 0);
                }
              });
              return sum;
            };
            
            return (
              <div className="space-y-6 text-right">
                <DialogHeader className="text-right border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <DialogTitle className="text-base font-black text-slate-900">
                        كشف إجابات الطالب: {studentName}
                      </DialogTitle>
                      <DialogDescription className="text-[11px] text-slate-500 font-bold">
                        الرقم القومي: {studentNationalId} | الاختبار: {associatedExam.title}
                      </DialogDescription>
                    </div>
                    <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-indigo-100 font-mono text-xs">
                      {trackingSelectedSub.status === 'GRADED' ? 'تم الاعتماد والرصد' : 'قيد المراجعة'}
                    </Badge>
                  </div>
                </DialogHeader>
                
                {/* Questions details inline */}
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                  <h3 className="text-xs font-black text-slate-800 border-r-4 border-indigo-600 pr-2">أوراق الإجابات وتفصيل التصحيح</h3>
                  
                  {associatedExam.questions.map((q, idx) => {
                    const studentAns = trackingSelectedSub.answers[q.id];
                    const gradeObj = trackingSelectedSub.grades[q.id];
                    const scoreAchieved = gradeObj ? gradeObj.score : 0;
                    
                    if (q.type === 'ESSAY') {
                      const currentScore = trackingScores[q.id] || 0;
                      const currentComment = trackingComments[q.id] || "";
                      return (
                        <div key={q.id} className="p-4 rounded-xl border border-dashed border-amber-200 bg-amber-50/20 space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">سؤال إنشائي/مقالي</Badge>
                            <span className="font-bold text-slate-500">السؤال {idx + 1} (الدرجة القصوى: {q.points})</span>
                          </div>
                          <p className="text-xs font-extrabold text-slate-800 leading-relaxed">{q.text}</p>
                          <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {studentAns ? String(studentAns) : <span className="text-rose-500 italic">لم تتم الإجابة</span>}
                          </div>
                          
                          {/* Grading control */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                            <div>
                              <Label className="text-[10px] text-slate-500 font-bold mr-1">الدرجة المحتسبة (0-{q.points})</Label>
                              <Input 
                                type="number" 
                                min={0} 
                                max={q.points} 
                                value={currentScore}
                                onChange={(e) => {
                                  let val = Number(e.target.value);
                                  if (val < 0) val = 0;
                                  if (val > q.points) val = q.points;
                                  setTrackingScores(prev => ({ ...prev, [q.id]: val }));
                                }}
                                className="h-8 text-xs text-center font-black"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label className="text-[10px] text-slate-500 font-bold mr-1">ملاحظات المدقق</Label>
                              <Input 
                                placeholder="أدخل ملحوظة للتصحيح..." 
                                value={currentComment}
                                onChange={(e) => setTrackingComments(prev => ({ ...prev, [q.id]: e.target.value }))}
                                className="h-8 text-xs font-bold"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      const isCorrect = scoreAchieved > 0;
                      return (
                        <div key={q.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <Badge variant="secondary" className="text-[10px] font-bold">
                              {q.type === 'TRUE_FALSE' ? 'صح/خطأ' : q.type === 'MULTIPLE_CHOICE' ? 'اختيار متعدد' : 'ربط ومطابقة'}
                            </Badge>
                            <span className="font-bold text-slate-400">السؤال {idx + 1}</span>
                          </div>
                          <p className="text-xs font-bold text-slate-850 leading-relaxed">{q.text}</p>
                          <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                            <strong>إجابة الطالب:</strong> <span className={isCorrect ? "text-emerald-600" : "text-rose-500"}>{studentAns === undefined ? "لم تتم الإجابة" : String(studentAns)}</span>
                            {q.correctAnswer && <span> • <strong>الإجابة الصحيحة:</strong> {String(q.correctAnswer)}</span>}
                          </p>
                          <div className="text-left">
                            <Badge className={`text-[10px] h-5 ${isCorrect ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                              الدرجة: {scoreAchieved} / {q.points} درجة
                            </Badge>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl flex items-center justify-between text-white font-bold text-xs" dir="ltr">
                  <div className="text-right flex flex-col">
                    <span className="text-[9px] text-slate-400 block">إجمالي المقالي</span>
                    <span className="text-[#10b981] font-black">{getEssayScore()} درجة</span>
                  </div>
                  <div className="text-right flex flex-col">
                    <span className="text-[9px] text-slate-400 block">إجمالي التلقائي</span>
                    <span className="text-indigo-400 font-black">{getAutoScore()} درجة</span>
                  </div>
                  <div className="text-right flex flex-col border-r border-slate-850 pl-4">
                    <span className="text-[9px] text-indigo-200 block">الدرجة التراكمية الإجمالية</span>
                    <span className="text-white font-black">{getAutoScore() + getEssayScore()} / {associatedExam.totalPoints} درجة</span>
                  </div>
                </div>
                
                {/* Save controls */}
                <DialogFooter className="flex gap-2 sm:justify-start pt-4 border-t border-slate-100">
                  <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setTrackingSelectedSub(null)}>إلغاء</Button>
                  <Button size="sm" className="h-9 bg-slate-900 hover:bg-black font-black text-xs text-white px-6 rounded-lg" onClick={handleSaveTrackingGrade}>
                    حفظ ومصادقة إجابات الطالب فوريّاً
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* VIEW: CREATION WIZARD COHESIVE SYSTEM */}
      {view === 'CREATE' && (
        <div className="space-y-6">
          {/* Step Indicator Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm max-w-5xl mx-auto">
            <div className="flex justify-between items-center relative">
              <div className="absolute right-0 top-1/2 left-0 h-0.5 bg-slate-100 -translate-y-1/2 -z-0"></div>
              {/* Step 1 */}
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  wizardStep >= 1 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'
                }`}>١</div>
                <span className="text-[10px] font-bold mt-2 text-slate-600">مصدر الأسئلة</span>
              </div>
              {/* Step 2 */}
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  wizardStep >= 2 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'
                }`}>٢</div>
                <span className="text-[10px] font-bold mt-2 text-slate-600">الإعدادات العامة</span>
              </div>
              {/* Step 3 */}
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  wizardStep >= 3 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'
                }`}>٣</div>
                <span className="text-[10px] font-bold mt-2 text-slate-600">تقسيم كتل المحتوى</span>
              </div>
              {/* Step 4 */}
              <div className="flex flex-col items-center relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  wizardStep >= 4 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'
                }`}>٤</div>
                <span className="text-[10px] font-bold mt-2 text-slate-600">تحرير محتوى الأسئلة</span>
              </div>
            </div>
          </div>

          {/* WIZARD STEP 1: REMOVED (Handled by Quick Cards in List View) */}
          {wizardStep === 1 && (
            <div className="max-w-4xl mx-auto flex flex-col items-center justify-center p-20 gap-6 animate-in fade-in duration-500">
               <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                 <RefreshCw size={40} className="animate-spin-slow" />
               </div>
               <div className="text-center">
                 <h2 className="text-xl font-black text-slate-800">يرجى اختيار طريقة إنشاء من لوحة التحكم</h2>
                 <p className="text-sm text-slate-400 font-bold mt-2">عليك اختيار أحد الخيارات الثلاثة في أعلى القائمة الرئيسية للبدء.</p>
               </div>
               <Button onClick={() => setView('LIST')} className="bg-slate-900 text-white font-bold px-8 h-11 rounded-xl">
                 عودة للرئيسية
               </Button>
            </div>
          )}

          {/* WIZARD STEP 1.5: AI DETAILS */}
          {wizardStep === 1.5 && (
            <Card className="max-w-4xl mx-auto border-slate-200 shadow-xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-300">
              <CardHeader className="bg-purple-50/50 border-b border-purple-100 p-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-black text-slate-900">إعداد التوليد الذكي</CardTitle>
                    <CardDescription className="text-xs font-bold text-slate-500">قم بضبط أنواع الأسئلة المطلوبة وتزويد النظام بالمادة العلمية.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="grid lg:grid-cols-5 gap-8">
                  {/* AI Generation Settings - Question types selection */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-black text-slate-900">عدد وأنواع الأسئلة</Label>
                      <Button variant="outline" size="sm" onClick={addBlock} className="h-7 text-[10px] font-bold">
                        <Plus size={12} className="ml-1" /> إضافة نوع
                      </Button>
                    </div>
                    
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {configBlocks.map((block) => (
                        <div key={block.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3 relative group">
                          <button 
                            onClick={() => removeBlock(block.id)}
                            className="absolute left-2 top-2 w-5 h-5 rounded-full bg-rose-50 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <X size={12} />
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                             <div className="space-y-1">
                               <Label className="text-[9px] font-bold text-slate-400">النوع</Label>
                               <Select value={block.type} onValueChange={(val) => updateBlock(block.id, { type: val })}>
                                <SelectTrigger className="h-8 text-[10px] font-bold bg-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="MULTIPLE_CHOICE" className="text-xs">متعدد</SelectItem>
                                  <SelectItem value="TRUE_FALSE" className="text-xs">صح/خطأ</SelectItem>
                                  <SelectItem value="MATCHING" className="text-xs">مزاوجة</SelectItem>
                                  <SelectItem value="ESSAY" className="text-xs">مقالي</SelectItem>
                                </SelectContent>
                               </Select>
                             </div>
                             <div className="space-y-1">
                               <Label className="text-[9px] font-bold text-slate-400">العدد</Label>
                               <Input 
                                type="number" 
                                min="1" 
                                className="h-8 text-xs bg-white font-bold"
                                value={block.itemCount}
                                onChange={(e) => updateBlock(block.id, { itemCount: parseInt(e.target.value) || 0 })}
                               />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                               <Label className="text-[9px] font-bold text-slate-400">الدرجة</Label>
                               <Input 
                                type="number" 
                                className="h-8 text-xs bg-white"
                                value={block.pointsPerItem}
                                onChange={(e) => updateBlock(block.id, { pointsPerItem: parseInt(e.target.value) || 1 })}
                               />
                             </div>
                             <div className="space-y-1">
                               <Label className="text-[9px] font-bold text-slate-400">الزمن (ث)</Label>
                               <Input 
                                type="number" 
                                className="h-8 text-xs bg-white"
                                value={block.timeLimit}
                                onChange={(e) => updateBlock(block.id, { timeLimit: parseInt(e.target.value) || 60 })}
                               />
                             </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 flex items-center justify-between">
                       <span className="text-xs font-black text-purple-900">إجمالي الأسئلة:</span>
                       <Badge className="bg-purple-600 text-white font-mono">{allocatedQuestionsCount}</Badge>
                    </div>
                  </div>

                  {/* AI Content Sources */}
                  <div className="lg:col-span-3 space-y-6">
                    <div className="space-y-3">
                      <Label className="text-xs font-black text-slate-700">موضوع الاختبار أو المنهج الدراسي</Label>
                      <textarea 
                        className="w-full min-h-[160px] p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all placeholder:text-slate-300 text-right"
                        placeholder="مثال: أسئلة عن الكيمياء العضوية..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        dir="rtl"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs font-black text-slate-700">رفع ملفات PDF / صور (اختياري)</Label>
                      
                      <div className="flex flex-col gap-3">
                        {/* Drag and Drop Zone */}
                        <div 
                          className={`relative border-2 border-dashed rounded-2xl p-8 transition-all group flex flex-col items-center justify-center gap-2 cursor-pointer
                            ${aiFile ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-purple-300 hover:bg-slate-50'}`}
                        >
                          <input 
                            type="file" 
                            accept=".pdf,image/*" 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => setAiFile(e.target.files?.[0] || null)}
                          />
                          <UploadCloud size={32} className={`${aiFile ? 'text-purple-600' : 'text-slate-400 group-hover:text-purple-500'}`} />
                          <span className="text-[10px] font-bold text-slate-500 text-center">
                            {aiFile ? (
                              <span className="text-purple-700">{aiFile.name}</span>
                            ) : (
                              "اسحب الملف هنا أو اضغط للاختيار من جهازك"
                            )}
                          </span>
                        </div>

                        {/* Google Drive Picker Trigger */}
                        <Button 
                          variant="outline" 
                          onClick={fetchDriveFiles}
                          className="w-full h-10 rounded-xl border-slate-200 text-[10px] font-bold flex items-center gap-2 bg-white hover:bg-slate-50"
                        >
                          <div className="w-5 h-5 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center">
                            <RefreshCw size={12} className={isLoadingDrive ? 'animate-spin' : ''} />
                          </div>
                          اختيار ملف من Google Drive
                        </Button>

                        {/* Folder note */}
                        <p className="text-[9px] text-slate-400 font-bold text-center">
                          * يتم معالجة الملفات بواسطة الذكاء الاصطناعي لاستخراج المنهج التعليمي وتوليد الأسئلة.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>

              {/* Drive File Picker Modal */}
              {isDrivePickerOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in backdrop-blur-sm">
                  <Card className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-6">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-black">اختيار ملف من Google Drive</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => setIsDrivePickerOpen(false)}>
                          <X size={18} />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-y-auto">
                      {driveFiles.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 font-bold text-xs">
                          لا توجد ملفات PDF أو صور في حسابك
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {driveFiles.map(file => (
                            <div 
                              key={file.id} 
                              className="p-4 flex items-center gap-4 hover:bg-indigo-50/50 cursor-pointer transition-colors"
                              onClick={() => {
                                setAiFile({ name: file.name, type: file.mimeType, driveId: file.id } as any);
                                setIsDrivePickerOpen(false);
                              }}
                            >
                              <div className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                                {file.mimeType.includes('pdf') ? <FileType size={16} /> : <Eye size={16} />}
                              </div>
                              <span className="text-xs font-bold text-slate-700 flex-1 truncate">{file.name}</span>
                              <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-indigo-600">اختيار</Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
              <CardFooter className="bg-slate-50 p-6 flex justify-between gap-4">
                <Button variant="ghost" onClick={() => setWizardStep(1)} className="font-bold text-xs h-11 px-6">
                  السابق &rarr;
                </Button>
                <Button 
                  onClick={handleAiGeneration}
                  disabled={isGenerating}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-black px-10 h-11 rounded-xl text-xs shadow-lg shadow-purple-200 flex items-center gap-2"
                >
                  {isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  بدء التوليد الذكي الآن &larr;
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* WIZARD STEP 2: GLOBAL SETTINGS & INFO */}
          {wizardStep === 2 && (
            <div className="max-w-3xl mx-auto animate-in slide-in-from-bottom duration-300">
              <Card className="shadow-md border-slate-200/80 rounded-2xl">
                <CardHeader className="py-6 px-8 border-b border-slate-100 bg-slate-50/20 rounded-t-2xl">
                  <CardTitle className="text-base font-black text-slate-800">بيانات الاختبار والإعدادات العامة</CardTitle>
                  <CardDescription className="text-xs">تحديد المسميات الرسمية، وضع ترقيم الجدولة وضبط معايير توقيت الاختبار.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {/* Title / Name */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700">عنوان الاختبار أو المسمى العام</Label>
                    <Input 
                      className="text-xs h-11 rounded-xl bg-slate-50/50 focus:bg-white border-slate-200"
                      value={currentExam.title}
                      onChange={(e) => setCurrentExam({ ...currentExam, title: e.target.value })}
                      placeholder="مثال: الاختبار القبلي الموحد لمهارات الحاسوب التطبيقية"
                    />
                  </div>

                  {/* Upfront Questions defined or pagination */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {creationMethod === 'MANUAL' && (
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-700">إجمالي عدد الأسئلة المستهدف</Label>
                        <Input 
                          type="number"
                          min="1"
                          max="50"
                          className="text-xs h-11 rounded-xl border-slate-200 text-center font-black"
                          value={totalQuestionsCount}
                          onChange={(e) => setTotalQuestionsCount(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                        <p className="text-[10px] text-slate-400">ستقوم في الخطوة التالية بتقسيم هذا العدد إلى كتل.</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 font-mono">طريقة عرض الأسئلة للطالب (الترقيم والصفحات)</Label>
                      <Select 
                        value={String(currentExam.questionsPerPage || 1)}
                        onValueChange={(val) => setCurrentExam({ ...currentExam, questionsPerPage: parseInt(val) })}
                      >
                        <SelectTrigger className="h-11 text-xs rounded-xl border-slate-200 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          <SelectItem value="1" className="text-xs">سؤال واحد في كل صفحة (تنقل خطوة بخطوة)</SelectItem>
                          <SelectItem value="2" className="text-xs">سؤالين تفاعليين بكل صفحة</SelectItem>
                          <SelectItem value="5" className="text-xs">5 أسئلة في الصفحة الواحدة</SelectItem>
                          <SelectItem value="10" className="text-xs">10 أسئلة في الصفحة الواحدة</SelectItem>
                          <SelectItem value="99" className="text-xs">عرض الامتحان بالكامل في صفحة واحدة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Timing Mode Setup */}
                  <div className="border border-slate-100 rounded-xl p-5 bg-slate-50/30 space-y-4">
                    <Label className="text-xs font-black text-slate-800">نظام احتساب الزمن والعد التنازلي التفاعلي</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className={`p-4 rounded-xl border cursor-pointer ${
                        currentExam.timingMode === 'QUESTION' ? 'border-indigo-500 bg-indigo-50/5' : 'border-slate-200 bg-white'
                      }`} onClick={() => setCurrentExam({ ...currentExam, timingMode: 'QUESTION' })}>
                        <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          <Clock size={14} className="text-indigo-500" />
                          مؤقت منفصل لكل سؤال على حدة
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold leading-relaxed">
                          يخصص لكل سؤال عدد ثوانٍ محدد؛ ينتهي وينتقل للسؤال التالي بمجرد نفاد زمنه الخاص.
                        </p>
                      </div>

                      <div className={`p-4 rounded-xl border cursor-pointer ${
                        currentExam.timingMode === 'GLOBAL' ? 'border-indigo-500 bg-indigo-50/5' : 'border-slate-200 bg-white'
                      }`} onClick={() => setCurrentExam({ ...currentExam, timingMode: 'GLOBAL' })}>
                        <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          <Clock size={14} className="text-blue-500" />
                          مؤقت عام واحد لكامل الاختبار
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold leading-relaxed">
                          يتم وضع زمن كلي للامتحان بالكامل، وللطالب حرية توزيعه والتنقل بين الأسئلة بحرية.
                        </p>
                      </div>
                    </div>

                    {currentExam.timingMode === 'GLOBAL' && (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 max-w-sm animate-in fade-in">
                        <Label className="text-[11px] font-bold text-slate-600">الزمن الإجمالي في الامتحان (ثانية)</Label>
                        <Input 
                          type="number"
                          className="h-9 text-xs font-mono text-center font-black"
                          value={currentExam.globalTimeLimit || 1800}
                          onChange={(e) => setCurrentExam({ ...currentExam, globalTimeLimit: Math.max(1, parseInt(e.target.value) || 1) })}
                        />
                        <p className="text-[10px] text-slate-400 font-bold text-center">مثال: ١٨٠٠ ثانية تعادل ٣٠ دقيقة كلياً للاختبار.</p>
                      </div>
                    )}
                  </div>

                  {/* Messaging Textareas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600">رسالة واجهة الترحيب الخاصة بالامتحان</Label>
                      <textarea 
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:outline-indigo-500 resize-none min-h-[70px]"
                        value={currentExam.welcomeMessage}
                        onChange={(e) => setCurrentExam({ ...currentExam, welcomeMessage: e.target.value })}
                        placeholder="اكتب التنبيه أو التوجيه الترحيبي عند فتح الامتحان..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-600">رسالة شكر وإتمام الامتحان للطلاب</Label>
                      <textarea 
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:outline-indigo-500 resize-none min-h-[70px]"
                        value={currentExam.completionMessage}
                        onChange={(e) => setCurrentExam({ ...currentExam, completionMessage: e.target.value })}
                        placeholder="الرسالة التي ستظهر للطالب فور حفظ الامتحان وإتمام الإجابة..."
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="py-5 px-8 bg-slate-50 border-t border-slate-100 flex justify-between">
                  <Button variant="ghost" onClick={() => setWizardStep(1)} className="text-xs font-bold">السابق &rarr;</Button>
                  <Button 
                    onClick={() => {
                      if (!currentExam.title?.trim()) {
                        toast.error("يرجى إدخال مسمى الاختبار لمواصلة الإعدادات");
                        return;
                      }
                      if (creationMethod === 'UPLOAD') {
                        // Upload method doesn't need block distribution step! Advance directly to step 4!
                        setWizardStep(4);
                      } else {
                        setWizardStep(3);
                      }
                    }} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-6 rounded-xl"
                  >
                    الخطوة التالية (توزيع المحتوى) &larr;
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}

          {/* WIZARD STEP 3: DYNAMIC CONFIGURATION OF BLOCKS (QUESTION TYPES) */}
          {wizardStep === 3 && (
            <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom duration-300 space-y-4">
              <Card className="shadow-md border-slate-200/80 rounded-2xl">
                <CardHeader className="py-6 px-10 border-b border-slate-100 bg-slate-50/25 rounded-t-2xl">
                  <CardTitle className="text-base font-black text-slate-800">تكوين وتوزيع كتل محتوى الامتحان</CardTitle>
                  <CardDescription className="text-xs font-bold text-slate-400">
                    أنت تقوم بتقسيم اختبار مكون من <span className="text-indigo-600 text-sm font-black">{totalQuestionsCount} أسئلة</span> إلى مجموعات متكافئة.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {/* Allocation statistics status tracker */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    allocatedQuestionsCount === totalQuestionsCount 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <AlertTriangle size={16} />
                      {allocatedQuestionsCount === totalQuestionsCount 
                        ? "الموازنة تامة! تم توزيع كامل أسئلتك على الكتل بنجاح." 
                        : `انتبه: تم توزيع وبناء [${allocatedQuestionsCount}] سؤال فقط حتى الآن من أصل [${totalQuestionsCount}] مستهدفة.`
                      }
                    </div>
                    <Badge variant={allocatedQuestionsCount === totalQuestionsCount ? 'default' : 'outline'} className="font-bold text-xs">
                      {allocatedQuestionsCount} / {totalQuestionsCount} سؤال
                    </Badge>
                  </div>

                  {/* Header of Block form */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-12 gap-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden md:grid">
                       <div className="col-span-3">نوع الأسئلة بالكتلة</div>
                       <div className="col-span-2 text-center">عدد الأسئلة (الفقرات)</div>
                       <div className="col-span-2 text-center">النقاط لكل سؤال</div>
                       <div className="col-span-3 text-center">زمن السؤال الواحد (ث)</div>
                       <div className="col-span-2 text-left">قيمة الكتلة</div>
                    </div>

                    <div className="space-y-3">
                      {configBlocks.map((block, index) => (
                        <div key={block.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center p-4 bg-slate-50/50 border border-slate-100/80 rounded-xl hover:shadow-sm transition-all relative">
                          <div className="col-span-3">
                            <Select 
                              value={block.type}
                              onValueChange={(val) => updateBlock(block.id, { type: val })}
                            >
                              <SelectTrigger className="h-10 text-xs rounded-lg border-slate-200 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white">
                                <SelectItem value="MULTIPLE_CHOICE" className="text-xs font-bold">اختيار من متعدد</SelectItem>
                                <SelectItem value="TRUE_FALSE" className="text-xs font-bold">صح / خطأ</SelectItem>
                                <SelectItem value="MATCHING" className="text-xs font-bold">مزاوجة (صل العمودين)</SelectItem>
                                <SelectItem value="ESSAY" className="text-xs font-bold">سؤال مقالي نصي</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="col-span-2">
                            <Input 
                              type="number"
                              min="1"
                              className="h-10 text-xs text-center border-slate-200 bg-white"
                              value={block.itemCount}
                              onChange={(e) => updateBlock(block.id, { itemCount: Math.max(1, parseInt(e.target.value) || 1) })}
                              placeholder="الكمية"
                            />
                          </div>

                          <div className="col-span-2">
                            <Input 
                              type="number"
                              min="1"
                              className="h-10 text-xs text-center border-slate-200 bg-white"
                              value={block.pointsPerItem}
                              onChange={(e) => updateBlock(block.id, { pointsPerItem: Math.max(1, parseInt(e.target.value) || 1) })}
                              placeholder="النقاط"
                            />
                          </div>

                          <div className="col-span-3">
                            <Input 
                              type="number"
                              disabled={currentExam.timingMode === 'GLOBAL'}
                              className="h-10 text-xs text-center border-slate-200 bg-white font-mono"
                              value={block.timeLimit}
                              onChange={(e) => updateBlock(block.id, { timeLimit: Math.max(1, parseInt(e.target.value) || 1) })}
                              placeholder={currentExam.timingMode === 'GLOBAL' ? 'مؤقت عام معطل' : 'ثواني لكل سؤال'}
                            />
                          </div>

                          <div className="col-span-2 flex items-center justify-between">
                            <span className="text-xs font-black text-indigo-700">
                               { (parseInt(block.itemCount) || 0) * (parseInt(block.pointsPerItem) || 0) } درجة
                            </span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-300 hover:text-red-500 rounded-lg"
                              onClick={() => removeBlock(block.id)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-start pt-2">
                    <Button variant="outline" size="sm" onClick={addBlock} className="text-xs border-dashed font-bold border-indigo-200 text-indigo-600 hover:bg-slate-50">
                      + إضافة كتلة أسئلة من طراز آخر
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="py-5 px-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                  <Button variant="ghost" className="text-xs font-bold" onClick={() => setWizardStep(2)}>السابق &rarr;</Button>
                  <Button 
                    onClick={generateQuestionsFromBlocks} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-10 rounded-xl shadow-lg"
                  >
                    توليد وحقن الهيكل في محرر الأسئلة &larr;
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}

          {/* WIZARD STEP 4: DETAILED QUESTIONS/CONTENT EDITOR */}
          {wizardStep === 4 && (
            <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom duration-300 pb-12">
              <Card className="shadow-lg border-slate-200 rounded-2xl">
                <CardHeader className="py-5 bg-white border-b border-slate-100 rounded-t-2xl">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-base font-black text-slate-800">محرر وراصد محتوى الأسئلة التفصيلي</CardTitle>
                      <CardDescription className="text-xs font-bold text-slate-400">صياغة الأسئلة، تدوين الخيارات، تحديد الإجابات وتدقيق النقاط.</CardDescription>
                    </div>

                    {/* Excel and JSON helper tools on block editing page */}
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition-all">
                        <FileSpreadsheet size={13} className="text-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-700">استيراد من Excel</span>
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
                      </label>
                      <Button variant="outline" size="sm" className="text-[10px] h-8 border-slate-200 font-bold hover:bg-slate-50" onClick={downloadExcelTemplate}>
                        <DownloadCloud size={13} className="ml-1 text-slate-500" /> تحميل قالب Excel
                      </Button>
                      <Button variant="outline" size="sm" className="text-[10px] h-8 border-slate-200 font-bold hover:bg-slate-50" onClick={exportToExcel}>
                        <FileSpreadsheet size={13} className="ml-1 text-emerald-600" /> تصدير Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 md:p-8 space-y-6 bg-slate-50/20">
                  {/* Title of Quiz Preview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div>
                      <Label className="text-[10px] text-slate-400 font-black uppercase">مسمى الامتحان المعتمد حالياً</Label>
                      <p className="text-sm font-black text-slate-800 mt-1">{currentExam.title || "اختبار جديد بدون عنوان"}</p>
                    </div>
                    <div className="flex items-center justify-end gap-3 text-left">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 font-bold">النقاط الكلية</span>
                        <span className="text-xs font-black text-indigo-600">
                          {currentExam.questions?.reduce((acc, q) => acc + q.points, 0) || 0} درجات
                        </span>
                      </div>
                      <div className="h-8 w-px bg-slate-100"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 font-bold">عدد الأسئلة</span>
                        <span className="text-xs font-black text-emerald-600">{currentExam.questions?.length || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Add manual builders */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-slate-200 pb-4">
                     <span className="text-xs font-bold text-slate-500 ml-2">إضافة سؤال فردي سريع:</span>
                     <Button size="sm" variant="outline" className="text-[10px] h-8 bg-white border-slate-200 font-bold hover:bg-indigo-50 border-dashed" onClick={() => addQuestion('MULTIPLE_CHOICE')}>+ إضافة اختيار متعدد</Button>
                     <Button size="sm" variant="outline" className="text-[10px] h-8 bg-white border-slate-200 font-bold hover:bg-indigo-50 border-dashed" onClick={() => addQuestion('TRUE_FALSE')}>+ إضافة صح/خطأ</Button>
                     <Button size="sm" variant="outline" className="text-[10px] h-8 bg-white border-slate-200 font-bold hover:bg-indigo-50 border-dashed" onClick={() => addQuestion('MATCHING')}>+ إضافة مزاوجة وعمودين</Button>
                     <Button size="sm" variant="outline" className="text-[10px] h-8 bg-white border-slate-200 font-bold hover:bg-indigo-50 border-dashed" onClick={() => addQuestion('ESSAY')}>+ إضافة مقال نصي</Button>
                     <Button size="sm" variant="outline" className="text-[10px] h-8 bg-indigo-50 border-indigo-250 text-indigo-700 font-black hover:bg-indigo-100 flex items-center gap-1 mr-auto" onClick={groupQuestionsByType}>
                       <RefreshCw size={11} /> تجميع وفرز حسب النوع تلقائياً
                     </Button>
                  </div>

                  {/* List of active Questions */}
                  {(!currentExam.questions || currentExam.questions.length === 0) ? (
                    <div className="text-center p-12 bg-white rounded-xl border border-slate-100 text-slate-400">
                      <HelpCircle size={32} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-black">لا توجد أي أسئلة في بنك الاختبار الفردي.</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">ابدأ بالنقر على أحد أزرار الإضافة السريعة أو ارجع للخلف لاستخدام المعالج.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {currentExam.questions.map((q, qIdx) => (
                        <Card key={q.id} className="relative bg-white border border-slate-150 shadow-sm rounded-xl hover:shadow duration-200">
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r-xl"></div>
                          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/20 rounded-t-xl">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-lg bg-indigo-900 text-white flex items-center justify-center font-bold text-[11px] font-mono">
                                {qIdx + 1}
                              </span>
                              <Badge className="bg-slate-100 hover:bg-slate-150 text-slate-600 font-bold text-[9px] border-none uppercase">
                                 {q.type === 'TRUE_FALSE' ? 'صح وغلط' : q.type === 'MULTIPLE_CHOICE' ? 'متعدد' : q.type === 'MATCHING' ? 'مزاوجة' : 'مقالي مراجع'}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 rounded text-slate-400 hover:text-indigo-600 disabled:opacity-30" 
                                disabled={qIdx === 0}
                                onClick={() => moveQuestion(qIdx, 'UP')} 
                                title="نقل للأعلى"
                              >
                                <ArrowUp size={13} />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 rounded text-slate-400 hover:text-indigo-600 disabled:opacity-30" 
                                disabled={qIdx === currentExam.questions.length - 1}
                                onClick={() => moveQuestion(qIdx, 'DOWN')} 
                                title="نقل للأسفل"
                              >
                                <ArrowDown size={13} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded text-slate-400 hover:text-indigo-600" onClick={() => copyQuestion(q)} title="تكرار السؤال">
                                <Copy size={13} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded text-slate-400 hover:text-red-500" onClick={() => removeQuestion(q.id)} title="حذف السؤال">
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </div>

                          <div className="p-5 space-y-4">
                            {/* Question text */}
                            <div className="space-y-1.5">
                              <Label className="text-[10px] text-slate-400 font-black uppercase">نص وصياغة السؤال الفعلي</Label>
                              {q.type === 'ESSAY' ? (
                                <textarea 
                                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white focus:outline-indigo-500 min-h-[70px]"
                                  placeholder="اكتب صياغة وتوجيهات السؤال المقالي المطلوب من الطالب الإجابة عليها..."
                                  value={q.text}
                                  onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                                />
                              ) : (
                                <Input 
                                  className="text-xs h-10 rounded-lg border-slate-200"
                                  placeholder="أدخل نص السؤال بوضوح هنا..."
                                  value={q.text}
                                  onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                                />
                              )}
                            </div>

                            {/* Weight and timing */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                  <Star size={11} className="text-amber-500" /> وزن السؤال (نقاط)
                                </Label>
                                <Input 
                                  type="number"
                                  className="h-9 text-xs text-center border-slate-200 font-black"
                                  value={q.points}
                                  onChange={(e) => updateQuestion(q.id, { points: Math.max(1, parseInt(e.target.value) || 1) })}
                                />
                              </div>

                              {currentExam.timingMode === 'QUESTION' && (
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                    <Clock size={11} className="text-blue-500" /> وقت السؤال (ثواني)
                                  </Label>
                                  <Input 
                                    type="number"
                                    className="h-9 text-xs text-center border-slate-200 font-mono"
                                    value={q.timeLimit || 60}
                                    onChange={(e) => updateQuestion(q.id, { timeLimit: Math.max(1, parseInt(e.target.value) || 1) })}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Options for MULTIPLE_CHOICE */}
                            {q.type === 'MULTIPLE_CHOICE' && (
                              <div className="space-y-3 bg-slate-50/40 p-4 rounded-xl border border-slate-100">
                                <Label className="text-[10px] font-black text-slate-500 uppercase">خيارات الإجابة المقترحة</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {(q.options || ['', '', '', '']).map((opt, optIdx) => (
                                    <div key={optIdx} className="flex gap-2 items-center">
                                      <span className="text-[10px] font-bold text-slate-400 shrink-0">خيار {optIdx + 1}</span>
                                      <Input 
                                        className="h-9 text-xs bg-white border-slate-200 rounded-lg flex-1"
                                        placeholder={`مثال للجواب البديل ${optIdx + 1}...`}
                                        value={opt}
                                        onChange={(e) => {
                                          const newOpts = [...(q.options || ['', '', '', ''])];
                                          newOpts[optIdx] = e.target.value;
                                          updateQuestion(q.id, { options: newOpts });
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-2 pt-2 border-t border-slate-200/50 flex flex-wrap items-center gap-3">
                                   <span className="text-[10px] font-bold text-slate-500">الإجابة النموذجية المعتمدة للدرجة الآلية:</span>
                                   <Select 
                                     value={String(q.correctAnswer || '')}
                                     onValueChange={(val) => updateQuestion(q.id, { correctAnswer: val })}
                                   >
                                     <SelectTrigger className="h-8 max-w-xs text-xs">
                                       <SelectValue placeholder="اختر الإجابة الصحيحة" />
                                     </SelectTrigger>
                                     <SelectContent className="bg-white">
                                        {(q.options || []).filter(Boolean).map((o, idx) => (
                                          <SelectItem key={idx} value={o} className="text-xs">{o}</SelectItem>
                                        ))}
                                     </SelectContent>
                                   </Select>
                                </div>
                              </div>
                            )}

                            {/* Core TRUE_FALSE buttons */}
                            {q.type === 'TRUE_FALSE' && (
                              <div className="flex flex-wrap items-center gap-4 bg-slate-50/30 p-4 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-black text-slate-500">الإجابة النموذجية (البديلة):</span>
                                <div className="flex gap-2">
                                  <Button 
                                    size="sm"
                                    type="button"
                                    variant={q.correctAnswer === 'TRUE' ? 'default' : 'outline'}
                                    className="h-8 text-xs font-bold px-5"
                                    onClick={() => updateQuestion(q.id, { correctAnswer: 'TRUE' })}
                                  >صح</Button>
                                  <Button 
                                    size="sm"
                                    type="button"
                                    variant={q.correctAnswer === 'FALSE' ? 'default' : 'outline'}
                                    className="h-8 text-xs font-bold px-5"
                                    onClick={() => updateQuestion(q.id, { correctAnswer: 'FALSE' })}
                                  >خطأ</Button>
                                </div>
                              </div>
                            )}

                            {/* MATCHING setup */}
                            {q.type === 'MATCHING' && (
                              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <Label className="text-[10px] font-black text-slate-500 uppercase">أزواج التطابق والربط السقفي (صل العمودين)</Label>
                                <div className="space-y-2">
                                   {(q.matchingPairs || []).map((pair, pIdx) => (
                                     <div key={pIdx} className="flex gap-2 items-center">
                                       <Input 
                                         className="h-9 text-xs flex-1 bg-white"
                                         placeholder="طرف العمود أ..."
                                         value={pair.left}
                                         onChange={(e) => {
                                           const newPairs = [...(q.matchingPairs || [])];
                                           newPairs[pIdx].left = e.target.value;
                                           updateQuestion(q.id, { matchingPairs: newPairs });
                                         }}
                                       />
                                       <span className="text-slate-300 font-bold shrink-0">::</span>
                                       <Input 
                                         className="h-9 text-xs flex-1 bg-white"
                                         placeholder="طرف العمود ب..."
                                         value={pair.right}
                                         onChange={(e) => {
                                           const newPairs = [...(q.matchingPairs || [])];
                                           newPairs[pIdx].right = e.target.value;
                                           updateQuestion(q.id, { matchingPairs: newPairs });
                                         }}
                                       />
                                       <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500 rounded" onClick={() => {
                                          const newPairs = (q.matchingPairs || []).filter((_, idx) => idx !== pIdx);
                                          updateQuestion(q.id, { matchingPairs: newPairs });
                                       }}>
                                         <X size={14} />
                                       </Button>
                                     </div>
                                   ))}
                                </div>
                                <Button variant="ghost" size="sm" className="text-[10px] h-7 text-indigo-600 font-bold hover:bg-white" onClick={() => {
                                   const newPairs = [...(q.matchingPairs || []), { left: '', right: '' }];
                                   updateQuestion(q.id, { matchingPairs: newPairs });
                                }}>+ إضافة زوج مطابقة جديد</Button>
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="py-5 px-8 bg-slate-50 border-t border-slate-150 flex justify-between items-center">
                  <Button variant="ghost" className="text-xs font-bold" onClick={() => setWizardStep(creationMethod === 'UPLOAD' ? 2 : 3)}>السابق &rarr;</Button>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" className="text-xs h-10 font-bold px-5 border-slate-300 rounded-xl" onClick={() => setView('LIST')}>إلغاء تماماً</Button>
                    <Button onClick={saveFinalExam} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-10 font-black px-8 rounded-xl shadow-lg shadow-indigo-100">
                      حفظ واعتماد التقييم النهائي
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* VIEW: ACADEMIC ESSAY GRADING PLATFORM */}
      {/* VIEW: COMPREHENSIVE GRADING DASHBOARD */}
      {view === 'GRADE' && !selectedSubmission && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setView('LIST')} className="text-xs h-9 font-bold gap-1 flex items-center">
              <ChevronRight size={14} /> العودة لقائمة الاختبارات
            </Button>
            <h2 className="text-sm font-black text-slate-800">مركز متابعة ورصد درجات الاختبار</h2>
          </div>
          <GraderDashboard />
        </div>
      )}

      {/* VIEW: SINGLE SUBMISSION GRADING (Retained legacy view) */}
      {view === 'GRADE' && selectedSubmission && (
        <div className="max-w-4xl mx-auto space-y-6 mb-20 animate-in slide-in-from-bottom duration-500">
           {/* Top Hero decoration bar */}
           <div className="bg-slate-900 rounded-3xl p-10 text-white mb-10 border border-slate-800 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] -mr-32 -mt-32"></div>
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
               <div>
                 <h2 className="text-2xl font-black flex items-center gap-3 tracking-tighter">
                   <PenTool className="text-indigo-400 animate-pulse" size={28} /> منصة تصحيح المراجعات الأكاديمية
                 </h2>
                 <p className="text-xs text-slate-400 mt-1 font-bold">تقييم إجابات الطلاب للأسئلة المفتوحة والمقالية وإبداء مراجعات التوجيه والتلقين الفردي.</p>
                 <div className="flex items-center gap-6 mt-5">
                    <div className="flex flex-col">
                       <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">معرف الرصد</span>
                       <span className="text-xs font-mono text-indigo-300">#GRADE_PORT_{selectedSubmission.id.substring(0,8)}</span>
                    </div>
                    <div className="h-8 w-px bg-slate-700"></div>
                    <div className="flex flex-col">
                       <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">مجموع درجات هذا التقييم</span>
                       <span className="text-xs font-bold text-emerald-400">
                         {exams.find(e => e.id === selectedSubmission.examId)?.totalPoints} درجة إجمالية
                       </span>
                    </div>
                 </div>
               </div>
               <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                  <Star size={24} className="text-amber-400 mb-1" />
                  <span className="text-[10px] font-black uppercase text-slate-300">قيد التدقيق</span>
               </div>
              </div>
           </div>
           
           {/* Grading sheets container */}
           <div className="space-y-6">
             {exams.find(e => e.id === selectedSubmission.examId)?.questions.filter(q => q.type === 'ESSAY').map((q, qIndex) => {
               const savedGrade = selectedSubmission.grades[q.id];
               return (
                 <Card key={q.id} className="shadow-lg border-slate-200 rounded-2xl overflow-hidden bg-white">
                      <CardHeader className="py-5 px-6 border-b border-slate-50 bg-slate-50/10">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-indigo-900 text-white flex items-center justify-center text-xs font-black shadow">
                                {qIndex + 1}
                             </div>
                             <div>
                                <CardTitle className="text-sm font-bold text-slate-800 leading-tight">السؤال المفتوح: {q.text}</CardTitle>
                             </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-black border-slate-200 px-3 h-6 bg-slate-50">الدرجة الموزونة: {q.points}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-6 space-y-6">
                        {/* Student response */}
                        <div className="p-5 bg-slate-50 text-slate-700 rounded-xl border border-slate-100 relative overflow-hidden min-h-[120px]">
                           <div className="absolute top-0 right-0 bottom-0 w-1 bg-indigo-600"></div>
                           <p className="text-[10px] font-bold text-slate-400 block mb-2">إجابة الطالب المدونة:</p>
                           <p className="text-sm leading-relaxed font-bold italic text-slate-600 whitespace-pre-wrap">{selectedSubmission.answers[q.id] || 'لم يسجل الطالب أي مدخل نصي أو جواب لهذا السؤال.'}</p>
                        </div>
                        
                        {/* Interactive edit form */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                           <div className="space-y-1.5">
                             <Label className="text-[10px] font-bold text-slate-500">الدرجة الممنوحة</Label>
                             <Input 
                                type="number" 
                                max={q.points} 
                                id={`score-${q.id}`}
                                className="bg-white border-slate-200 text-sm font-black h-10 rounded-lg text-center"
                                defaultValue={savedGrade?.score || 0}
                                onChange={(e) => {
                                   const val = Number(e.target.value);
                                   if (val > q.points) e.target.value = String(q.points);
                                }}
                              />
                           </div>
                           <div className="md:col-span-3 space-y-1.5">
                             <Label className="text-[10px] font-bold text-slate-500">التعليق والتقييم التفصيلي</Label>
                             <Input 
                                className="bg-white border-slate-200 text-xs h-10 rounded-lg"
                                placeholder="اكتب مراجعة أكاديمية تبيّن للطالب كيف يطور مستوى إجابته..." 
                                defaultValue={savedGrade?.comment || ""}
                                id={`comment-${q.id}`}
                              />
                           </div>
                        </div>
                      </CardContent>
                      <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-end py-3 px-6">
                        <Button 
                          size="sm" 
                          className="h-8 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-lg px-4" 
                          onClick={() => {
                            const scoreInput = document.getElementById(`score-${q.id}`) as HTMLInputElement;
                            const commentInput = document.getElementById(`comment-${q.id}`) as HTMLInputElement;
                            gradeSubmission(selectedSubmission.id, q.id, Number(scoreInput?.value || 0), commentInput?.value || "");
                          }}
                        >
                          <CheckCircle size={14} className="ml-1.5"/> اعتماد رصد هذا السؤال
                        </Button>
                      </CardFooter>
                 </Card>
               );
             })}
           </div>
           
           <div className="flex flex-col items-center gap-2 py-8 border-t border-dashed border-slate-200 mt-10">
             <Button size="lg" className="bg-slate-900 hover:bg-black text-white font-black px-12 shadow-lg h-12 rounded-xl" onClick={() => setView('LIST')}>
                إنهاء لوحة التصحيح وترسيب النتائج
             </Button>
             <p className="text-[10px] text-slate-400 font-bold italic">ملاحظة: تظهر النتائج في بوابات الطلاب وأولياء الأمور مباشرة بعد الاعتماد النهائي.</p>
           </div>
        </div>
      )}
    </div>
  );
}
