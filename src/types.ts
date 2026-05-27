/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Role = 'ADMIN' | 'REVIEWER' | 'GRADER' | 'STUDENT';

export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'INCOMPLETE' | 'REVISION_REQUESTED';

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'file' | 'image';
  required: boolean;
  options?: string[];
  system?: boolean; // For initial template tracking but can still be fully customized
  validationType?: 'none' | 'name' | 'phone' | 'email' | 'national_id';
  minNumber?: number;
  maxNumber?: number;
  hidden?: boolean;
}

export interface StudentApplication {
  id: string;
  registrationNumber: string;
  fullName: string;
  province: string;
  dob: string;
  nationalId: string;
  score: number;
  fatherName: string;
  fatherJob: string;
  motherName: string;
  motherJob: string;
  phone: string;
  documents: {
    personalPhoto?: string; 
    birthCertificate?: string;
    prepCertificate?: string;
    parentNationalId?: string;
  };
  status: ApplicationStatus;
  notes?: string;
  examDate?: string;
  createdAt: string;
  updatedAt?: string;
  customData: Record<string, any>;
  cloudSynced?: boolean;
}

export interface Question {
  id: string;
  type: 'TRUE_FALSE' | 'MULTIPLE_CHOICE' | 'MATCHING' | 'ESSAY';
  text: string;
  options?: string[]; // For MULTIPLE_CHOICE
  matchingPairs?: { left: string; right: string }[]; // For MATCHING
  correctAnswer?: string | string[]; // For auto-grading
  points: number;
  timeLimit?: number; // In seconds
}

export interface Exam {
  id: string;
  title: string;
  questions: Question[];
  totalPoints: number;
  visible?: boolean;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timingMode?: 'GLOBAL' | 'QUESTION';
  globalTimeLimit?: number;
  questionsPerPage?: number;
  welcomeMessage?: string;
  completionMessage?: string;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  studentId: string;
  answers: Record<string, any>;
  grades: Record<string, { score: number; comment: string }>;
  totalGrade?: number;
  status: 'SUBMITTED' | 'GRADED';
}

export interface FormTemplate {
  id: string;
  name: string;
  formFields: FormField[];
  createdAt: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  responsesFolderId?: string;
  filesFolderId?: string;
}

export interface SystemSettings {
  registrationOpen: boolean;
  registrationDeadline?: string;
  formFields: FormField[];
  activeFormTemplateId?: string;
  formTemplates?: FormTemplate[];
  googleDriveFolderId?: string;
  googleDriveFolderUrl?: string;
  spreadsheetId?: string;
}

export interface ExamResultRow {
  id: string; // submission id
  studentId: string;
  studentName: string;
  nationalId: string;
  examId: string;
  examTitle: string;
  autoQuizzesScore: number;
  essayScore: number;
  totalScore: number;
  status: 'SUBMITTED' | 'GRADED';
  submittedAt: string;
  gradesBreakdown: Record<string, number>;
}

