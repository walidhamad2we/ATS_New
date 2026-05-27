/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Role } from "./types";
import RegistrationForm from "./components/RegistrationForm";
import StudentTracking from "./components/StudentTracking";
import AdminDashboard from "./components/AdminDashboard";
import ReviewerDashboard from "./components/ReviewerDashboard";
import StudentExams from "./components/StudentExams";
import ExamManager from "./components/ExamManager";
import GraderDashboard from "./components/GraderDashboard";
import ParentPortal from "./components/ParentPortal";
import ExamResults from "./components/ExamResults";
import StudentAdmission from "./components/StudentAdmission";
import FormTemplateManager from "./components/FormTemplateManager";
import { Toaster } from "sonner";
import { 
  UserPlus, 
  Search, 
  GraduationCap, 
  Menu, 
  X, 
  LogOut,
  User,
  Home,
  BookOpen,
  Loader2,
  Shield,
  ClipboardCheck,
  PenTool,
  Lock,
  ArrowRight,
  ArrowLeft,
  UserCheck,
  FileSpreadsheet,
  Users,
  Settings
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Input } from "./components/ui/input";
import { motion, AnimatePresence } from "motion/react";
import { storage } from "./lib/storage";
import { initAuth, googleSignIn, logout as googleLogout } from "./lib/googleAuth";
import { toast } from "sonner";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [emulatedRole, setEmulatedRole] = useState<Role | null>(null);
  const [activeTab, setActiveTab] = useState<string>("HOME");
  const [isReady, setIsReady] = useState(false);
  const [appToEdit, setAppToEdit] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loginModal, setLoginModal] = useState<{ isOpen: boolean, role: Role | null }>({ isOpen: false, role: null });
  const [credentials, setCredentials] = useState({ username: '', password: '' });

  useEffect(() => {
    storage.init().then(() => setIsReady(true));

    // For now, we will use local storage for authenticated session
    const savedSession = localStorage.getItem('app_session');
    if (savedSession) {
      const session = JSON.parse(savedSession);
      setUser(session.user);
      setRoles(session.roles);
      if (session.roles.includes('ADMIN')) {
        const savedEmulated = localStorage.getItem('emulated_role') as Role | null;
        setEmulatedRole(savedEmulated || 'ADMIN');
      }
    }
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [activeTab]);

  const handleLocalLogin = () => {
    const { username, password } = credentials;
    let authUser = null;
    let authRoles: Role[] = [];

    if (username === 'admin' && password === '1234') {
      authUser = { displayName: 'المدير العام', email: 'admin@system.com', uid: 'admin' };
      authRoles = ['ADMIN', 'REVIEWER', 'GRADER'];
    } else if (username === 'Rev' && password === '1234') {
      authUser = { displayName: 'المشرف المراجع', email: 'rev@system.com', uid: 'rev' };
      authRoles = ['REVIEWER'];
    } else if (username === 'Tech' && password === '1234') {
      authUser = { displayName: 'المصحح التقني', email: 'tech@system.com', uid: 'tech' };
      authRoles = ['GRADER'];
    }

    if (authUser) {
      setUser(authUser);
      setRoles(authRoles);
      localStorage.setItem('app_session', JSON.stringify({ user: authUser, roles: authRoles }));
      if (authRoles.includes('ADMIN')) {
        setEmulatedRole('ADMIN');
        localStorage.setItem('emulated_role', 'ADMIN');
      } else {
        setEmulatedRole(null);
        localStorage.removeItem('emulated_role');
      }
      setLoginModal({ isOpen: false, role: null });
      setCredentials({ username: '', password: '' });
      toast.success(`أهلاً بك، ${authUser.displayName}`);
    } else {
      toast.error("خطأ في اسم المستخدم أو كلمة المرور");
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('app_session');
    localStorage.removeItem('emulated_role');
    setUser(null);
    setRoles([]);
    setEmulatedRole(null);
    setActiveTab("HOME");
    toast.info("تم تسجيل الخروج");
  };

  const effectiveRoles = roles.includes('ADMIN')
    ? (emulatedRole === 'ADMIN' || !emulatedRole
        ? ['ADMIN', 'REVIEWER', 'GRADER']
        : emulatedRole === 'REVIEWER'
          ? ['REVIEWER']
          : ['GRADER'])
    : roles;

  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-bold">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'HOME':
        return (
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-4 md:p-6 animate-in fade-in duration-500" dir="rtl">
            <div className="w-full max-w-6xl space-y-6 md:space-y-8">
              <header className="text-center space-y-2">
                <div className="space-y-1">
                  <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">بوابة القبول الموحد</h1>
                  <p className="text-sm md:text-base text-slate-500 font-bold tracking-wide">الموقع الرسمي لمدارس التكنولوجيا التطبيقية</p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-black h-7 md:h-8 px-4 text-xs md:text-sm">العام الدراسي ٢٠٢٦ - ٢٠٢٧</Badge>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <NavCard 
                  title="الرئيسية" 
                  desc="العودة لشاشة البداية" 
                  icon={<Home size={22} />}
                  color="bg-slate-900"
                  onClick={() => setActiveTab('HOME')}
                />
                <NavCard 
                  title="طلب جديد" 
                  desc="بدء استمارة تسجيل طالب جديد" 
                  icon={<UserPlus size={22} />}
                  color="bg-blue-600"
                  onClick={() => setActiveTab('REGISTER')}
                />
                <NavCard 
                  title="بوابة ولي الأمر" 
                  desc="الاستعلام الآمن واستلام الرسائل والقرارات" 
                  icon={<UserCheck size={22} />}
                  color="bg-indigo-600"
                  onClick={() => setActiveTab('PARENT_PORTAL')}
                />
                <NavCard 
                  title="متابعة الطلب" 
                  desc="الاستعلام عن الحالة والمواعيد" 
                  icon={<Search size={22} />}
                  color="bg-emerald-600"
                  onClick={() => setActiveTab('TRACK')}
                />
                <NavCard 
                  title="الاختبارات" 
                  desc="دخول الاختبارات والمقابلات" 
                  icon={<BookOpen size={22} />}
                  color="bg-amber-600"
                  onClick={() => setActiveTab('EXAMS')}
                />
              </div>

              <div className="pt-8 border-t border-slate-200">
                <div className="flex flex-wrap justify-center gap-6 md:gap-8 text-xs md:text-sm font-black text-slate-600 uppercase tracking-tight">
                  <button onClick={() => setLoginModal({ isOpen: true, role: 'ADMIN' })} className="flex items-center gap-2 hover:text-indigo-600 transition-all hover:scale-105 active:scale-95">
                    <Lock size={18} className="text-indigo-500" /> تسجيل كمسئول
                  </button>
                  <button onClick={() => setLoginModal({ isOpen: true, role: 'REVIEWER' })} className="flex items-center gap-2 hover:text-emerald-600 transition-all hover:scale-105 active:scale-95">
                    <ClipboardCheck size={18} className="text-emerald-500" /> تسجيل كمشرف مراجع
                  </button>
                  <button onClick={() => setLoginModal({ isOpen: true, role: 'GRADER' })} className="flex items-center gap-2 hover:text-amber-600 transition-all hover:scale-105 active:scale-95">
                    <PenTool size={18} className="text-amber-500" /> تسجيل كمصحح اختبارات
                  </button>
                </div>
                {user && (
                   <div className="mt-8 flex flex-col items-center gap-4">
                     {roles.includes('ADMIN') ? (
                       <div className="space-y-3 text-center">
                         <p className="text-xs text-slate-400 font-bold">محاكاة لوحات التحكم والصلاحيات (للمدير العام):</p>
                         <div className="flex flex-wrap justify-center gap-2">
                           <Button 
                             size="sm" 
                             className={`font-black hover:scale-105 active:scale-95 transition-all text-sm rounded-xl px-4 py-2 ${
                               emulatedRole === 'ADMIN' || !emulatedRole 
                                 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 scale-105' 
                                 : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                             }`} 
                             onClick={() => {
                               setEmulatedRole('ADMIN');
                               setActiveTab('FORM_DESIGN');
                               toast.success("تم تحويل الواجهة والصلاحيات إلى: المدير العام (الكل)");
                             }}
                           >
                             لوحة الادمن
                           </Button>
                           <Button 
                             size="sm" 
                             className={`font-black hover:scale-105 active:scale-95 transition-all text-sm rounded-xl px-4 py-2 ${
                               emulatedRole === 'REVIEWER' 
                                 ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 scale-105' 
                                 : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600'
                             }`} 
                             onClick={() => {
                               setEmulatedRole('REVIEWER');
                               setActiveTab('REVIEW');
                               toast.success("جاري محاكاة واجهة وصلاحيات: المشرف المراجع");
                             }}
                           >
                             لوحة المشرف
                           </Button>
                           <Button 
                             size="sm" 
                             className={`font-black hover:scale-105 active:scale-95 transition-all text-sm rounded-xl px-4 py-2 ${
                               emulatedRole === 'GRADER' 
                                 ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20 scale-105' 
                                 : 'bg-slate-100 text-slate-700 hover:bg-amber-50 hover:text-amber-600'
                             }`} 
                             onClick={() => {
                               setEmulatedRole('GRADER');
                               setActiveTab('GRADES');
                               toast.success("جاري محاكاة واجهة وصلاحيات: المصحح التقني");
                             }}
                           >
                             لوحة المصحح
                           </Button>
                           <Button variant="ghost" size="sm" className="text-red-500 font-bold" onClick={handleLogout}>خروج</Button>
                         </div>
                       </div>
                     ) : (
                       <div className="flex gap-2">
                         {roles.includes('REVIEWER') && <Button size="sm" className="bg-emerald-600 font-bold" onClick={() => setActiveTab('REVIEW')}>لوحة المشرف</Button>}
                         {roles.includes('GRADER') && <Button size="sm" className="bg-amber-600 font-bold" onClick={() => setActiveTab('GRADES')}>لوحة المصحح</Button>}
                         <Button variant="ghost" size="sm" className="text-red-500 font-bold" onClick={handleLogout}>خروج</Button>
                       </div>
                     )}
                   </div>
                )}
              </div>
            </div>

            {/* Login Modal */}
            <AnimatePresence>
              {loginModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    onClick={() => setLoginModal({ isOpen: false, role: null })}
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
                  />
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-white rounded-3xl p-8 shadow-2xl relative z-10 w-full max-w-sm border border-slate-200"
                  >
                    <div className="text-center space-y-2 mb-8">
                       <h3 className="text-xl font-black text-slate-900">تسجيل دخول الصلاحيات</h3>
                       <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                         {loginModal.role === 'ADMIN' ? 'الدخول كمسئول للنظام' : 
                          loginModal.role === 'REVIEWER' ? 'الدخول كمدقق ومراجع' : 'الدخول كمصحح تقني'}
                       </p>
                    </div>

                    <div className="space-y-4">
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-tighter">اسم المستخدم</label>
                          <Input 
                            value={credentials.username}
                            onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                            className="h-12 border-slate-200 rounded-xl bg-slate-50 font-bold"
                            placeholder="admin / Rev / Tech"
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-tighter">كلمة المرور</label>
                          <Input 
                            type="password"
                            value={credentials.password}
                            onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                            className="h-12 border-slate-200 rounded-xl bg-slate-50 font-bold"
                            placeholder="••••"
                            onKeyDown={(e) => e.key === 'Enter' && handleLocalLogin()}
                          />
                       </div>
                       <Button 
                         onClick={handleLocalLogin}
                         className="w-full h-12 bg-slate-900 hover:bg-black font-black rounded-xl text-md mt-4 transition-all"
                       >
                         دخول النظام
                       </Button>
                       <Button 
                         variant="ghost" 
                         onClick={() => setLoginModal({ isOpen: false, role: null })}
                         className="w-full h-12 text-slate-400 font-bold rounded-xl"
                       >
                         إلغاء
                       </Button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        );
      case 'REGISTER': return <RegistrationForm initialApplication={appToEdit} />;
      case 'TRACK': return <StudentTracking onEditApplication={(app) => { setAppToEdit(app); setActiveTab('REGISTER'); }} />;
      case 'PARENT_PORTAL': return <ParentPortal onBackToHome={() => setActiveTab('HOME')} onEditApplication={(app) => { setAppToEdit(app); setActiveTab('REGISTER'); }} />;
      case 'EXAMS': return <StudentExams />;
      case 'FORM_DESIGN': return <FormTemplateManager />;
      case 'ADMIN_TOOLS': return <AdminDashboard initialTab="settings" />;
      case 'REVIEW': return <ReviewerDashboard />;
      case 'GRADES': return <GraderDashboard />;
      case 'EXAM_DESIGN': return <ExamManager />;
      case 'ADMISSION': return <StudentAdmission />;
      case 'RESULTS': return <ExamResults />;
      default: return null;
    }
  };

  return (
    <div className="h-screen flex flex-row bg-slate-50 overflow-hidden font-sans" dir="rtl">
      <Toaster position="top-center" richColors />
      
      {/* Mobile Sidebar Slide-out Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <div className="fixed inset-0 z-[60] md:hidden flex justify-start">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-64 bg-slate-900 text-white flex flex-col h-full shadow-2xl z-50 text-right"
              dir="rtl"
            >
              <div className="p-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-black">A</div>
                  <h1 className="text-sm font-bold tracking-tight">بوابة القبول</h1>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-white rounded-lg h-8 w-8"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X size={16} />
                </Button>
              </div>
              
              <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
                <div className="text-[9px] uppercase tracking-widest text-slate-500 px-3 mb-1 font-bold select-none">محتويات الموقع</div>
                
                <SidebarLink 
                  icon={<Home size={16}/>} 
                  label="الصفحة الرئيسية" 
                  active={activeTab === 'HOME'} 
                  onClick={() => setActiveTab('HOME')} 
                />

                <div className="h-px bg-slate-800/60 my-1.5" />

                <SidebarLink 
                  icon={<UserPlus size={16}/>} 
                  label="طلب جديد" 
                  active={activeTab === 'REGISTER'} 
                  onClick={() => setActiveTab('REGISTER')} 
                />
                <SidebarLink 
                  icon={<Search size={16}/>} 
                  label="متابعة الطلب" 
                  active={activeTab === 'TRACK'} 
                  onClick={() => setActiveTab('TRACK')} 
                />
                <SidebarLink 
                  icon={<UserCheck size={16}/>} 
                  label="بوابة ولي الأمر" 
                  active={activeTab === 'PARENT_PORTAL'} 
                  onClick={() => setActiveTab('PARENT_PORTAL')} 
                />
                <SidebarLink 
                  icon={<BookOpen size={16}/>} 
                  label="الاختبارات" 
                  active={activeTab === 'EXAMS'} 
                  onClick={() => setActiveTab('EXAMS')} 
                />

                {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('REVIEWER') || effectiveRoles.includes('GRADER')) && (
                  <>
                    <div className="h-px bg-slate-800/60 my-1.5" />
                    <div className="text-[9px] uppercase tracking-widest text-slate-500 px-3 mb-1 font-bold">لوحة الإدارة التقنية</div>
                    
                    {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('REVIEWER')) && (
                      <SidebarLink 
                        icon={<ClipboardCheck size={16}/>} 
                        label="مراجعة الطلبات" 
                        active={activeTab === 'REVIEW'} 
                        onClick={() => setActiveTab('REVIEW')} 
                      />
                    )}
                    
                    {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('GRADER')) && (
                      <SidebarLink 
                        icon={<PenTool size={16}/>} 
                        label="تصحيح الاختبارات" 
                        active={activeTab === 'GRADES'} 
                        onClick={() => setActiveTab('GRADES')} 
                      />
                    )}

                    {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('REVIEWER') || effectiveRoles.includes('GRADER')) && (
                      <SidebarLink 
                        icon={<FileSpreadsheet size={16}/>} 
                        label="نتائج الاختبارات" 
                        active={activeTab === 'RESULTS'} 
                        onClick={() => setActiveTab('RESULTS')} 
                      />
                    )}

                    {effectiveRoles.includes('ADMIN') && (
                      <>
                        <SidebarLink 
                          icon={<Lock size={16}/>} 
                          label="تصميم وإدارة الاستمارات" 
                          active={activeTab === 'FORM_DESIGN'} 
                          onClick={() => setActiveTab('FORM_DESIGN')} 
                        />
                        <SidebarLink 
                          icon={<BookOpen size={16}/>} 
                          label="إدارة الاختبارات" 
                          active={activeTab === 'EXAM_DESIGN'} 
                          onClick={() => setActiveTab('EXAM_DESIGN')} 
                        />
                        <SidebarLink 
                          icon={<Users size={16}/>} 
                          label="قبول الطلاب" 
                          active={activeTab === 'ADMISSION'} 
                          onClick={() => setActiveTab('ADMISSION')} 
                        />
                        <SidebarLink 
                          icon={<Shield size={16}/>} 
                          label="أدوات المسئول" 
                          active={activeTab === 'ADMIN_TOOLS'} 
                          onClick={() => setActiveTab('ADMIN_TOOLS')} 
                        />
                      </>
                    )}
                  </>
                )}
              </nav>

              {user && (
                <div className="p-3 mt-auto border-t border-slate-800">
                  <div className="flex items-center gap-2.5 px-2.5 py-2 bg-slate-800/50 rounded-lg border border-slate-800">
                    <div className="w-7.5 h-7.5 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs">
                       <User size={14} />
                    </div>
                    <div className="overflow-hidden flex-1 text-right">
                      <p className="text-[9px] font-bold truncate leading-none mb-1 text-slate-200">
                        {user.displayName}
                      </p>
                      <button onClick={handleLogout} className="text-[9px] text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors font-bold">
                        <LogOut size={9} /> خروج
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Persistent Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0 hidden md:flex">
        <div className="p-4 py-3.5 border-b border-slate-800">
          <button 
            onClick={() => setActiveTab('HOME')}
            className="flex items-center gap-2.5 text-right hover:opacity-85 transition-all w-full select-none"
          >
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold">A</div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">بوابة القبول</h1>
              <p className="text-[9px] text-slate-400 leading-none">الموقع الرسمي للتسجيل</p>
            </div>
          </button>
        </div>
        
        <nav className="flex-1 p-2.5 space-y-0.5">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 px-3 mb-1 font-bold select-none">محتويات الموقع</div>
          
          <SidebarLink 
            icon={<Home size={16}/>} 
            label="الصفحة الرئيسية" 
            active={activeTab === 'HOME'} 
            onClick={() => setActiveTab('HOME')} 
          />
          
          <div className="h-px bg-slate-800/60 my-1.5" />

          <SidebarLink 
            icon={<UserPlus size={16}/>} 
            label="طلب جديد" 
            active={activeTab === 'REGISTER'} 
            onClick={() => setActiveTab('REGISTER')} 
          />
          <SidebarLink 
            icon={<Search size={16}/>} 
            label="متابعة الطلب" 
            active={activeTab === 'TRACK'} 
            onClick={() => setActiveTab('TRACK')} 
          />
          <SidebarLink 
            icon={<UserCheck size={16}/>} 
            label="بوابة ولي الأمر" 
            active={activeTab === 'PARENT_PORTAL'} 
            onClick={() => setActiveTab('PARENT_PORTAL')} 
          />
          <SidebarLink 
            icon={<BookOpen size={16}/>} 
            label="الاختبارات" 
            active={activeTab === 'EXAMS'} 
            onClick={() => setActiveTab('EXAMS')} 
          />

          {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('REVIEWER') || effectiveRoles.includes('GRADER')) && (
            <>
              <div className="h-px bg-slate-800/60 my-1.5" />
              <div className="text-[9px] uppercase tracking-widest text-slate-500 px-3 mb-1 font-bold">لوحة الإدارة التقنية</div>
              
              {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('REVIEWER')) && (
                <SidebarLink 
                  icon={<ClipboardCheck size={16}/>} 
                  label="مراجعة الطلبات" 
                  active={activeTab === 'REVIEW'} 
                  onClick={() => setActiveTab('REVIEW')} 
                />
              )}
              
              {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('GRADER')) && (
                <SidebarLink 
                  icon={<PenTool size={16}/>} 
                  label="تصحيح الاختبارات" 
                  active={activeTab === 'GRADES'} 
                  onClick={() => setActiveTab('GRADES')} 
                />
              )}

              {(effectiveRoles.includes('ADMIN') || effectiveRoles.includes('REVIEWER') || effectiveRoles.includes('GRADER')) && (
                <SidebarLink 
                  icon={<FileSpreadsheet size={16}/>} 
                  label="نتائج الاختبارات" 
                  active={activeTab === 'RESULTS'} 
                  onClick={() => setActiveTab('RESULTS')} 
                />
              )}

              {effectiveRoles.includes('ADMIN') && (
                <>
                  <SidebarLink 
                    icon={<Lock size={16}/>} 
                    label="تصميم وإدارة الاستمارات" 
                    active={activeTab === 'FORM_DESIGN'} 
                    onClick={() => setActiveTab('FORM_DESIGN')} 
                  />
                  <SidebarLink 
                    icon={<BookOpen size={16}/>} 
                    label="إدارة الاختبارات" 
                    active={activeTab === 'EXAM_DESIGN'} 
                    onClick={() => setActiveTab('EXAM_DESIGN')} 
                  />
                  <SidebarLink 
                    icon={<Users size={16}/>} 
                    label="قبول الطلاب" 
                    active={activeTab === 'ADMISSION'} 
                    onClick={() => setActiveTab('ADMISSION')} 
                  />
                  <SidebarLink 
                    icon={<Shield size={16}/>} 
                    label="أدوات المسئول" 
                    active={activeTab === 'ADMIN_TOOLS'} 
                    onClick={() => setActiveTab('ADMIN_TOOLS')} 
                  />
                </>
              )}
            </>
          )}
        </nav>

        {user && (
          <div className="p-3 mt-auto border-t border-slate-800">
            <div className="flex items-center gap-2.5 px-2.5 py-2 bg-slate-800/50 rounded-xl border border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-xs">
                 <User size={16} />
              </div>
              <div className="overflow-hidden flex-1 text-right">
                <p className="text-[10px] font-bold truncate leading-none mb-1 text-slate-200">
                  {user.displayName}
                </p>
                <button onClick={handleLogout} className="text-[10px] text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors font-bold">
                  <LogOut size={10} /> خروج
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-auto">
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 shrink-0 sticky top-0 z-50">
           <div className="flex items-center gap-3">
              <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setIsSidebarOpen(true)}>
                 <Menu size={20} />
              </Button>
                  <h2 className="text-sm font-black text-slate-900 tracking-tight">
                    {activeTab === 'HOME' ? 'الرئيسية' : 
                     activeTab === 'REGISTER' ? 'تسجيل طالب جديد' : 
                     activeTab === 'TRACK' ? 'متابعة حالة الطلب' : 
                     activeTab === 'PARENT_PORTAL' ? 'بوابة ولي الأمر الآمنة' : 
                     activeTab === 'EXAMS' ? 'الاختبارات والمقابلات' : 
                     activeTab === 'FORM_DESIGN' ? 'تصميم وإدارة الاستمارات' : 
                     activeTab === 'REVIEW' ? 'مراجعة طلبات الالتحاق' : 
                     activeTab === 'GRADES' ? 'تصحيح الاختبارات' : 
                     activeTab === 'RESULTS' ? 'نتائج الاختبارات' : 
                     activeTab === 'ADMISSION' ? 'فرز وقبول الطلاب' : ''}
                  </h2>
           </div>

           {/* Emulation Switcher for Admin in Persistent Header */}
           {roles.includes('ADMIN') && (
             <div className="hidden md:flex items-center gap-2 bg-slate-100/80 border border-slate-200/40 p-1 rounded-xl shadow-inner">
               <span className="text-[10px] font-black text-slate-400 px-2 select-none">محاكاة الصلاحيات:</span>
               <button 
                 onClick={() => {
                   setEmulatedRole('ADMIN');
                   setActiveTab('FORM_DESIGN');
                   toast.success("تم تحويل الواجهة والصلاحيات إلى: المدير العام (الكل)");
                 }}
                 className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                   emulatedRole === 'ADMIN' || !emulatedRole
                     ? 'bg-indigo-600 text-white shadow-sm scale-102 font-extrabold' 
                     : 'text-slate-600 hover:bg-slate-200/50'
                 }`}
               >
                 لوحة الادمن
               </button>
               <button 
                 onClick={() => {
                   setEmulatedRole('REVIEWER');
                   setActiveTab('REVIEW');
                   toast.success("جاري محاكاة واجهة وصلاحيات: المشرف المراجع");
                 }}
                 className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                   emulatedRole === 'REVIEWER' 
                     ? 'bg-emerald-600 text-white shadow-sm scale-102 font-extrabold' 
                     : 'text-slate-600 hover:bg-slate-200/50'
                 }`}
               >
                 لوحة المشرف
               </button>
               <button 
                 onClick={() => {
                   setEmulatedRole('GRADER');
                   setActiveTab('GRADES');
                   toast.success("جاري محاكاة واجهة وصلاحيات: المصحح التقني");
                 }}
                 className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                   emulatedRole === 'GRADER' 
                     ? 'bg-amber-600 text-white shadow-sm scale-102 font-extrabold' 
                     : 'text-slate-600 hover:bg-slate-200/50'
                 }`}
               >
                 لوحة المصحح
               </button>
             </div>
           )}
           
           <div className="flex items-center gap-4">
              {user && (
                <div className="flex items-center gap-2 pl-4 border-l border-slate-100 hidden sm:flex">
                   <div className="text-left">
                     <p className="text-[10px] font-bold text-slate-900 leading-none">{user.displayName}</p>
                     <p className="text-[8px] text-slate-400 font-mono mt-0.5 uppercase">
                       {roles.includes('ADMIN') ? `محاكاة: ${emulatedRole || 'ADMIN'}` : roles[0]}
                     </p>
                   </div>
                   <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                     <User size={14} className="text-slate-400" />
                   </div>
                </div>
              )}
           </div>
        </header>

        <div className="flex-1 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="py-8 bg-white border-t border-slate-200 mt-12">
          <div className="max-w-6xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-6">
             <div className="space-y-1 text-center md:text-right">
               <div className="flex items-center justify-center md:justify-start gap-2">
                 <Shield className="text-indigo-600" size={14} />
                 <span className="text-xs font-black text-slate-900">منصة القبول الذكية</span>
               </div>
               <p className="text-[10px] text-slate-400 font-medium">جميع الحقوق محفوظة © ٢٠٢٦ مدارس التكنولوجيا التطبيقية</p>
             </div>
             
             <div className="flex gap-4 text-[10px] font-bold text-slate-500">
               <a href="#" className="hover:text-indigo-600 transition-colors">سياسة الخصوصية</a>
               <a href="#" className="hover:text-indigo-600 transition-colors">شروط الاستخدام</a>
               <a href="#" className="hover:text-indigo-600 transition-colors">اتصل بنا</a>
             </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function NavCard({ title, desc, icon, color, onClick }: any) {
  return (
    <motion.div 
      whileHover={{ y: -6, shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }}
      whileTap={{ scale: 0.98 }}
      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all cursor-pointer group hover:border-indigo-300 text-right h-full flex flex-col"
      onClick={onClick}
    >
      <div className={`w-11 h-11 ${color} text-white rounded-xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-300`}>
        {icon}
      </div>
      <h3 className="text-sm font-black text-slate-900 mb-1.5">{title}</h3>
      <p className="text-slate-500 text-[11px] font-bold leading-relaxed">{desc}</p>
      <div className="mt-auto pt-4 flex items-center gap-1.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest group-hover:gap-3 transition-all">
         دخول <ArrowLeft size={12} />
      </div>
    </motion.div>
  );
}

function RoleCard({ title, desc, icon, color, onClick }: any) {
  return (
    <motion.div 
      whileHover={{ y: -4, shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
      whileTap={{ scale: 0.98 }}
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all cursor-pointer group hover:border-indigo-200 text-right"
      onClick={onClick}
    >
      <div className={`w-12 h-12 ${color} text-white rounded-xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
      <div className="mt-6 flex items-center gap-2 text-[10px] font-bold text-indigo-600 uppercase tracking-wider group-hover:gap-3 transition-all">
         دخول مخصص للنظام <span>&larr;</span>
      </div>
    </motion.div>
  );
}

function SidebarLink({ icon, label, active, onClick }: any) {
  const getIconColor = () => {
    if (active) return 'text-white bg-white/15';
    
    switch (label) {
      case 'الصفحة الرئيسية':
        return 'text-sky-400 bg-sky-500/10';
      case 'طلب جديد':
        return 'text-emerald-400 bg-emerald-500/10';
      case 'متابعة الطلب':
        return 'text-amber-400 bg-amber-500/10';
      case 'بوابة ولي الأمر':
        return 'text-indigo-400 bg-indigo-500/10';
      case 'الاختبارات':
        return 'text-fuchsia-400 bg-fuchsia-500/10';
      case 'مراجعة الطلبات':
        return 'text-cyan-400 bg-cyan-500/10';
      case 'تصحيح الاختبارات':
        return 'text-teal-400 bg-teal-500/10';
      case 'تصميم الاستمارات':
        return 'text-purple-400 bg-purple-500/10';
      case 'إدارة الاختبارات':
        return 'text-violet-400 bg-violet-500/10';
      case 'قبول الطلاب':
        return 'text-blue-400 bg-blue-500/10';
      case 'أدوات المسئول':
        return 'text-rose-400 bg-rose-500/10';
      default:
        return 'text-indigo-400 bg-indigo-500/10';
    }
  };

  const bgIconClass = getIconColor();

  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-sm font-black mb-0.5 text-right ${
        active 
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/25 scale-102 ring-1 ring-white/10' 
          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
      }`}
    >
      <span className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 transition-all ${bgIconClass}`}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
