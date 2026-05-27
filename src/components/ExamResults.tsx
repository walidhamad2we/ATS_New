/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { storage } from '../lib/storage';
import { Exam, ExamResultRow } from '../types';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Search, 
  Download, 
  Trash2, 
  Users, 
  Award, 
  TrendingUp, 
  CheckCircle, 
  RefreshCw,
  Clock,
  CircleAlert,
  ChevronDown
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

export default function ExamResults() {
  const [exams, setExams] = useState<Exam[]>(storage.getExams());
  const [activeExamId, setActiveExamId] = useState<string>("");
  const [rows, setRows] = useState<ExamResultRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'GRADED' | 'SUBMITTED'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync basic data
  const loadData = async () => {
    setIsRefreshing(true);
    await storage.init();
    const allExams = storage.getExams();
    setExams(allExams);

    if (allExams.length > 0) {
      // Pick first exam by default if none selected
      const selectedId = activeExamId || allExams[0].id;
      setActiveExamId(selectedId);
      const sheetRows = await storage.getResultsSheet(selectedId);
      setRows(sheetRows);
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync rows when active exam selection changes
  useEffect(() => {
    if (!activeExamId) return;
    const fetchRows = async () => {
      const sheetRows = await storage.getResultsSheet(activeExamId);
      setRows(sheetRows);
    };
    fetchRows();
  }, [activeExamId]);

  // Clean filtered results rows
  const filteredRows = rows.filter(r => {
    const matchesSearch = 
      r.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.nationalId.includes(searchTerm) ||
      r.studentId.includes(searchTerm);

    const matchesStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'GRADED' && r.status === 'GRADED') ||
      (statusFilter === 'SUBMITTED' && r.status === 'SUBMITTED');

    return matchesSearch && matchesStatus;
  });

  const activeExam = exams.find(e => e.id === activeExamId);

  // Stats calculators
  const getTotalParticipants = () => filteredRows.length;
  
  const getAverageScore = () => {
    if (filteredRows.length === 0) return 0;
    const total = filteredRows.reduce((sum, r) => sum + r.totalScore, 0);
    return Math.round((total / filteredRows.length) * 10) / 10;
  };

  const getHighestScore = () => {
    if (filteredRows.length === 0) return 0;
    return Math.max(...filteredRows.map(r => r.totalScore));
  };

  const getCompletionRate = () => {
    if (filteredRows.length === 0) return 0;
    const gradedCount = filteredRows.filter(r => r.status === 'GRADED').length;
    return Math.round((gradedCount / filteredRows.length) * 100);
  };

  // spreadsheet download triggers
  const exportToExcel = () => {
    if (filteredRows.length === 0) {
      toast.warning("لا توجد تقديرات أو أوراق منجزة للطلاب لتصديرها للشيت حالياً");
      return;
    }

    const reportExamTitle = activeExam?.title || "شيت التقييم المشترك";

    const dataToExport = filteredRows.map((r, index) => ({
      'م': index + 1,
      'رقم التسجيل للطالب': r.studentId,
      'اسم الطالب التكاملي': r.studentName,
      'الرقم القومي للطالب': r.nationalId,
      'عنوان التقييم': r.examTitle,
      'درجة الأسئلة الموضوعية (الآلية)': r.autoQuizzesScore,
      'درجة الأسئلة المقالية (اليدوية)': r.essayScore,
      'المجموع الإجمالي الكلي للدرجات': r.totalScore,
      'حالة رصد التقييم النهائي': r.status === 'GRADED' ? 'مكتمل ورصد التقديرات' : 'بانتظار تصحيح المقالي',
      'تاريخ الإرسال': new Date(r.submittedAt).toLocaleString('ar-EG')
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Auto-adjust layout to RTL for Arabic elegance!
    worksheet['!dir'] = 'rtl';

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "كشف رصد التقييمات");

    const sanitizedTitle = reportExamTitle.replace(/\s+/g, '_');
    XLSX.writeFile(workbook, `شيت_رصد_نتائج_${sanitizedTitle}.xlsx`);
    toast.success(`تم بنجاح تصدير شيت (${reportExamTitle}) بصيغة Excel الحقيقية وبتقسيمات درجات القبول!`);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 font-sans" dir="rtl text-right">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Decks */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200/60 pb-6">
          <div className="text-right">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" /> شيت رصد نتائج الاختبارات الموحد
            </h1>
            <p className="text-slate-500 text-xs font-semibold mt-1.5">مركز التصدير الإحصائي وعرض كشوف رصد الدرجات لمدارس التكنولوجيا القبول لعام ٢٠٢٦ - ٢٠٢٧</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Pick exam dropdown */}
            <div className="relative">
              <select
                value={activeExamId}
                onChange={(e) => setActiveExamId(e.target.value)}
                className="appearance-none bg-white border border-slate-200 h-11 px-10 pl-12 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {exams.length === 0 ? (
                  <option value="">-- لا يوجد اختبارات مضافة حالياً --</option>
                ) : (
                  exams.map(e => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))
                )}
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              <FileSpreadsheet className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" size={16} />
            </div>

            <Button onClick={loadData} variant="outline" className="h-11 rounded-xl border-slate-200" disabled={isRefreshing}>
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
            </Button>

            <Button 
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 rounded-xl gap-2 shadow-sm"
              onClick={exportToExcel}
              disabled={filteredRows.length === 0}
            >
              <Download size={16} /> تصدير الشيت المعتمد للاكسل
            </Button>
          </div>
        </div>

        {/* Dashboard KPIs row */}
        {activeExam && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
             {/* Participants */}
             <Card className="border-slate-200 bg-white rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Users size={24} />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-extrabold block">مجموع المنجزين للاختبار</span>
                  <span className="text-xl font-black text-slate-800">{getTotalParticipants()} طلاب</span>
                </div>
             </Card>

             {/* Average Cumulative */}
             <Card className="border-slate-200 bg-white rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                  <TrendingUp size={24} />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-extrabold block">متوسط الدرجة الحالية</span>
                  <span className="text-xl font-black text-slate-800">{getAverageScore()} / {activeExam.totalPoints} درجة</span>
                </div>
             </Card>

             {/* Top Achiever */}
             <Card className="border-slate-200 bg-white rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <Award size={24} />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-extrabold block">أعلى درجة مسجلة</span>
                  <span className="text-xl font-black text-slate-800">{getHighestScore()} / {activeExam.totalPoints} درجة</span>
                </div>
             </Card>

             {/* Completions */}
             <Card className="border-slate-200 bg-white rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <CheckCircle size={24} />
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-extrabold block">نسبة اكتمال التصحيح اليدوي</span>
                  <span className="text-xl font-black text-slate-800">{getCompletionRate()}% من الأداء</span>
                </div>
             </Card>
          </div>
        )}

        {/* Filters and spreadsheet grid */}
        <Card className="border-slate-200 shadow-md rounded-2xl bg-white overflow-hidden text-right">
          <CardHeader className="border-b border-slate-100 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-right space-y-1">
              <CardTitle className="text-md font-black">جدول رصد الدرجات والتقييم التفصيلي</CardTitle>
              <CardDescription className="text-slate-450 text-[11px] font-bold">يعرض الجدول تقسيمات درجات التقييم التلقائي والمقالي لكل متقدم</CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Type Filter */}
              <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50 p-1">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${statusFilter === 'ALL' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  الكل ({rows.length})
                </button>
                <button
                  onClick={() => setStatusFilter('GRADED')}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${statusFilter === 'GRADED' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  الرصد المكتمل ({rows.filter(r => r.status === 'GRADED').length})
                </button>
                <button
                  onClick={() => setStatusFilter('SUBMITTED')}
                  className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${statusFilter === 'SUBMITTED' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  قيد مراجعة المقالي ({rows.filter(r => r.status === 'SUBMITTED').length})
                </button>
              </div>

              {/* Text Search Box */}
              <div className="relative w-full sm:w-60">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-450" size={15} />
                <Input 
                  placeholder="ابحث باسم الطالب، كود، قومي..."
                  className="pr-9 h-9 border-slate-200 text-xs text-right bg-slate-50 focus:bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0 overflow-x-auto">
            {filteredRows.length === 0 ? (
              <div className="p-16 text-center space-y-3">
                <CircleAlert className="text-slate-300 mx-auto" size={40} />
                <h4 className="text-slate-700 font-extrabold text-sm">لا توجد سجلات مطابقة لخيارات الرصد</h4>
                <p className="text-slate-405 text-xs font-semibold max-w-sm mx-auto">تأكد من اختيار الامتحان الصحيح، أو التحقق من الكلمات الدلالية في حقل البحث.</p>
              </div>
            ) : (
              <table className="w-full text-right border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-slate-50/60 text-[10px] font-bold text-slate-450 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-4 px-6 font-black">رقم كود الطالب</th>
                    <th className="py-4 px-6 font-black">اسم المترشح رباعي</th>
                    <th className="py-4 px-6 font-black text-center">الرقم القومي</th>
                    <th className="py-4 px-6 text-center font-black">مجموع التلقائي</th>
                    <th className="py-4 px-6 text-center font-black">مجموع المقالي</th>
                    <th className="py-4 px-6 text-center font-black">الدرجة الكلية الكلية</th>
                    <th className="py-4 px-6 text-center font-black">الحالة الفورية</th>
                    <th className="py-4 px-6 text-center font-black">وقت وتاريخ التسليم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors font-semibold text-slate-700">
                      <td className="py-4 px-6 font-mono text-slate-500 font-bold">#{row.studentId.slice(0, 10)}</td>
                      <td className="py-4 px-6 font-bold text-slate-900">{row.studentName}</td>
                      <td className="py-4 px-6 text-center text-slate-600 font-mono">{row.nationalId}</td>
                      <td className="py-4 px-6 text-center font-black text-indigo-650">{row.autoQuizzesScore} / {activeExam ? activeExam.questions.filter(q=>q.type!=='ESSAY').reduce((s,q)=>s+q.points, 0) : 0}</td>
                      <td className="py-4 px-6 text-center font-black text-amber-650">{row.essayScore} / {activeExam ? activeExam.questions.filter(q=>q.type==='ESSAY').reduce((s,q)=>s+q.points, 0) : 0}</td>
                      <td className="py-4 px-6 text-center font-black text-slate-950 text-sm">
                        <span className="bg-emerald-50 text-emerald-800 border-emerald-100 border px-2 py-1 rounded-lg">
                          {row.totalScore} / {activeExam?.totalPoints}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <Badge className={`border-0 shadow-none hover:shadow-none pointer-events-none px-2.5 py-1 text-[10px] font-bold ${row.status === 'GRADED' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50' : 'bg-amber-50 text-amber-700 hover:bg-amber-50'}`}>
                          {row.status === 'GRADED' ? 'رصد نهائي' : 'مطلوب تصحيح'}
                        </Badge>
                      </td>
                      <td className="py-4 px-6 text-center text-[10px] text-slate-450 font-medium">
                        {new Date(row.submittedAt).toLocaleString('ar-EG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
