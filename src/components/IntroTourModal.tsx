import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  FolderTree, 
  Brain, 
  Sparkles, 
  Globe, 
  Layers, 
  Search, 
  Download, 
  CheckCircle2, 
  Clock, 
  Zap, 
  ShieldCheck, 
  GraduationCap,
  Sun,
  Moon,
  RotateCw,
  UserCheck,
  LogIn,
  User,
  Check,
  HelpCircle,
  Sparkle
} from 'lucide-react';
import { translations } from '../translations';
import type { Language } from '../App';

interface IntroTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme?: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  user?: any;
  onSignIn?: () => void;
}

const STEP_ICONS = [
  <FolderTree key="0" className="w-8 h-8 text-indigo-400 animate-pulse" />,
  <Brain key="1" className="w-8 h-8 text-cyan-400 animate-pulse" />,
  <Zap key="2" className="w-8 h-8 text-rose-400 animate-pulse" />,
  <Globe key="3" className="w-8 h-8 text-amber-400 animate-pulse" />
];

const FEATURE_ICONS = [
  [<FolderTree key="a" size={18} className="text-indigo-400" />, <Search key="b" size={18} className="text-rose-400" />, <Download key="c" size={18} className="text-cyan-400" />],
  [<CheckCircle2 key="d" size={18} className="text-cyan-400" />, <Clock key="e" size={18} className="text-indigo-400" />, <Brain key="f" size={18} className="text-amber-400" />],
  [<Zap key="g" size={18} className="text-rose-400" />, <Clock key="h" size={18} className="text-violet-400" />, <ShieldCheck key="i" size={18} className="text-indigo-400" />],
  [<Globe key="j" size={18} className="text-amber-400" />, <Sparkles key="k" size={18} className="text-rose-400" />, <Moon key="l" size={18} className="text-cyan-400" />]
];

const LANGUAGES: { key: Language; label: string; native: string }[] = [
  { key: 'English', label: 'English', native: 'English' },
  { key: 'Amharic', label: 'Amharic', native: 'አማርኛ' },
  { key: 'Oromifa', label: 'Oromifa', native: 'Afaan Oromoo' },
  { key: 'Tigrinya', label: 'Tigrinya', native: 'ትግርኛ' }
];

export const IntroTourModal: React.FC<IntroTourModalProps> = ({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  theme = 'dark',
  onThemeChange,
  user,
  onSignIn
}) => {
  // Step 0 = Preferences & Welcome, Steps 1..4 = Guided Flashcard steps
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setIsFlipped(false);
      setDirection(1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const t = translations[language] || translations.English;
  const steps = t.tourSteps || translations.English.tourSteps;
  const totalSteps = steps.length + 1; // Step 0 + 4 steps = 5 total

  const handleNext = () => {
    setIsFlipped(false);
    if (currentStep < totalSteps - 1) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    } else {
      // Finishing tour leads directly to the main page
      onClose();
    }
  };

  const handlePrev = () => {
    setIsFlipped(false);
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 120 : -120,
      rotateY: dir > 0 ? 12 : -12,
      scale: 0.92,
      opacity: 0,
    }),
    center: {
      x: 0,
      rotateY: 0,
      scale: 1,
      opacity: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 28,
      },
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 120 : -120,
      rotateY: dir < 0 ? 12 : -12,
      scale: 0.92,
      opacity: 0,
      transition: {
        duration: 0.2,
      },
    }),
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Outer Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 260 }}
          className={`relative z-10 w-full max-w-2xl rounded-[2.5rem] border p-6 md:p-8 overflow-hidden shadow-2xl transition-colors ${
            theme === 'light'
              ? 'bg-white border-slate-200 text-slate-900 shadow-2xl'
              : 'bg-[#0b1329] border-indigo-900/60 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]'
          }`}
        >
          {/* Background Gradient Accents (Indigo / Violet / Cyan) */}
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Header Bar */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-indigo-950/80">
            {/* Left Brand Badge */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white font-black shadow-md shadow-indigo-500/20">
                <GraduationCap size={22} />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                <span className={`font-black text-base tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  HaHu Cards
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 inline-flex items-center gap-1">
                  <Sparkles size={11} />
                  {t.tourBadge || "100% FREE"}
                </span>
              </div>
            </div>

            {/* Right Controls: Skip / Close */}
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                  theme === 'light'
                    ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-zinc-400 hover:text-white hover:bg-indigo-950/60'
                }`}
              >
                {t.tourSkip || "Skip"}
              </button>
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-all active:scale-95 ${
                  theme === 'light'
                    ? 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-zinc-400 hover:text-white hover:bg-indigo-900/40'
                }`}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Animated Step Content Area */}
          <div className="min-h-[380px] flex flex-col justify-between">
            <AnimatePresence custom={direction} mode="wait">
              {currentStep === 0 ? (
                /* STEP 0: WELCOME & PREFERENCES (Language, Theme, Guest/Login) */
                <motion.div
                  key="step-0"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-6"
                >
                  {/* Step Title & Subtitle */}
                  <div className="space-y-1.5">
                    <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shadow-sm">
                      WELCOME & SETUP
                    </span>
                    <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                      {t.tourWelcomeTitle || "Welcome to HaHu Cards"}
                    </h2>
                    <p className={`text-xs sm:text-sm leading-relaxed ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                      {t.tourWelcomeSubtitle || "Customise your preferences before starting your journey."}
                    </p>
                  </div>

                  {/* Option Cards Grid */}
                  <div className="grid grid-cols-1 gap-4">
                    {/* 1. Language Selector */}
                    <div className={`p-4 rounded-2xl border transition-colors ${
                      theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-indigo-950/40 border-indigo-900/60'
                    }`}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <Globe size={16} className="text-indigo-400" />
                        <span className={`text-xs font-bold uppercase tracking-wider ${theme === 'light' ? 'text-slate-700' : 'text-indigo-300'}`}>
                          {t.selectLanguage || "Preferred Language"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {LANGUAGES.map((langObj) => {
                          const isActive = language === langObj.key;
                          return (
                            <button
                              key={langObj.key}
                              onClick={() => onLanguageChange(langObj.key)}
                              className={`p-2.5 rounded-xl border text-left transition-all active:scale-95 flex flex-col justify-between ${
                                isActive
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                                  : theme === 'light'
                                  ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                  : 'bg-indigo-900/30 border-indigo-800/60 text-slate-300 hover:border-indigo-700'
                              }`}
                            >
                              <span className="text-[11px] font-bold opacity-80">{langObj.label}</span>
                              <span className="text-xs font-black flex items-center justify-between mt-1">
                                {langObj.native}
                                {isActive && <Check size={14} className="text-white" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Theme Selector & Account Choice Side-by-Side */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Theme Selector */}
                      <div className={`p-3.5 rounded-2xl border transition-colors flex flex-col justify-between ${
                        theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-indigo-950/40 border-indigo-900/60'
                      }`}>
                        <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-2.5 ${
                          theme === 'light' ? 'text-slate-700' : 'text-indigo-300'
                        }`}>
                          <Moon size={15} className="text-indigo-400" />
                          {t.selectTheme || "Theme Mode"}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => onThemeChange('dark')}
                            className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              theme === 'dark'
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                                : theme === 'light'
                                ? 'bg-white border-slate-200 text-slate-700'
                                : 'bg-indigo-900/30 border-indigo-800 text-slate-400'
                            }`}
                          >
                            <Moon size={14} />
                            Dark
                          </button>
                          <button
                            onClick={() => onThemeChange('light')}
                            className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              theme === 'light'
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                                : 'bg-indigo-900/30 border-indigo-800 text-slate-400'
                            }`}
                          >
                            <Sun size={14} />
                            Light
                          </button>
                        </div>
                      </div>

                      {/* Account Choice (Sign In or Guest) */}
                      <div className={`p-3.5 rounded-2xl border transition-colors flex flex-col justify-between ${
                        theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-indigo-950/40 border-indigo-900/60'
                      }`}>
                        <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 mb-2.5 ${
                          theme === 'light' ? 'text-slate-700' : 'text-indigo-300'
                        }`}>
                          <User size={15} className="text-indigo-400" />
                          {t.accountChoice || "Account"}
                        </span>

                        {user ? (
                          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between text-xs font-bold text-indigo-300">
                            <div className="flex items-center gap-2 truncate">
                              <UserCheck size={16} className="text-indigo-400 shrink-0" />
                              <span className="truncate">{user.displayName || user.email}</span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-extrabold uppercase shrink-0">
                              Logged In
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              {/* Guest Button */}
                              <div
                                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-default transition-all ${
                                  theme === 'light'
                                    ? 'bg-slate-100 border-slate-300 text-slate-800'
                                    : 'bg-indigo-900/40 border-indigo-700 text-indigo-200'
                                }`}
                              >
                                <User size={14} className="text-rose-400 shrink-0" />
                                <span>{t.guestButton || "Guest"}</span>
                              </div>

                              {/* Sign In Button */}
                              {onSignIn ? (
                                <button
                                  onClick={onSignIn}
                                  className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md shadow-indigo-600/25"
                                >
                                  <LogIn size={14} />
                                  <span>{t.signInButton || "Sign In"}</span>
                                </button>
                              ) : (
                                <div className="p-2.5 rounded-xl bg-indigo-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5">
                                  <LogIn size={14} />
                                  <span>{t.signInButton || "Sign In"}</span>
                                </div>
                              )}
                            </div>

                            <p className="text-[10px] text-center opacity-75 leading-tight">
                              ✓ Free access. Sign in optional for syncing across devices.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* STEPS 1..4: PREVIEW AS PREMIUM FLASHCARD FORMAT */
                <motion.div
                  key={`step-${currentStep}`}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-4"
                >
                  {/* Step Eyebrow & Step Counter */}
                  <div className="flex items-center justify-between">
                    <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shadow-sm">
                      {steps[currentStep - 1].tag}
                    </span>
                    <span className={`text-xs font-black ${theme === 'light' ? 'text-slate-400' : 'text-slate-400'}`}>
                      FLASHCARD {currentStep} / {totalSteps - 1}
                    </span>
                  </div>

                  {/* FLASHCARD CONTAINER (Interactive Flip Format) */}
                  <div 
                    className="relative w-full cursor-pointer select-none group"
                    style={{ perspective: '1000px' }}
                    onMouseEnter={() => setIsFlipped(true)}
                    onMouseLeave={() => setIsFlipped(false)}
                    onClick={() => setIsFlipped(prev => !prev)}
                  >
                    <motion.div
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      style={{ transformStyle: 'preserve-3d' }}
                      className="w-full min-h-[250px] relative rounded-3xl"
                    >
                      {/* --- CARD FRONT --- */}
                      <div
                        className={`w-full h-full p-6 sm:p-7 rounded-3xl border-2 flex flex-col justify-between shadow-xl transition-all ${
                          theme === 'light'
                            ? 'bg-gradient-to-br from-indigo-50 via-white to-slate-50 border-indigo-200 text-slate-900 group-hover:border-indigo-400'
                            : 'bg-gradient-to-br from-indigo-950/90 via-[#0d1733] to-[#070d1f] border-indigo-800/80 text-white group-hover:border-indigo-500'
                        }`}
                        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                              <Sparkles size={12} />
                              {t.cardFrontTitle || "FLASHCARD • FRONT"}
                            </span>
                            <h3 className={`text-xl sm:text-2xl font-black tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                              {steps[currentStep - 1].title}
                            </h3>
                          </div>
                          <div className="p-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 shrink-0">
                            {STEP_ICONS[currentStep - 1] || STEP_ICONS[0]}
                          </div>
                        </div>

                        <p className={`text-xs sm:text-sm leading-relaxed mb-6 ${
                          theme === 'light' ? 'text-slate-600' : 'text-slate-300'
                        }`}>
                          {steps[currentStep - 1].desc}
                        </p>

                        {/* Interactive Flip Trigger Bar */}
                        <div className={`pt-3 border-t flex items-center justify-between text-xs font-bold ${
                          theme === 'light' ? 'border-slate-200 text-indigo-600' : 'border-indigo-900/60 text-indigo-400'
                        }`}>
                          <span className="flex items-center gap-1.5">
                            <RotateCw size={14} className="animate-spin" style={{ animationDuration: '4s' }} />
                            {t.flipCardPrompt || "Hover or click card to flip"}
                          </span>
                          <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] uppercase font-black">
                            FRONT
                          </span>
                        </div>
                      </div>

                      {/* --- CARD BACK --- */}
                      <div
                        className={`absolute inset-0 w-full h-full p-6 sm:p-7 rounded-3xl border-2 flex flex-col justify-between shadow-xl transition-all ${
                          theme === 'light'
                            ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border-indigo-500 text-white'
                            : 'bg-gradient-to-br from-indigo-950 via-[#0a1226] to-[#0d162f] border-indigo-500 text-white'
                        }`}
                        style={{ 
                          backfaceVisibility: 'hidden', 
                          WebkitBackfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)'
                        }}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-3 border-b border-indigo-800/60 pb-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
                              <Sparkles size={12} />
                              {t.cardBackTitle || "FLASHCARD • BACK"}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-[10px] text-indigo-300 uppercase font-black">
                              BACK
                            </span>
                          </div>

                          {/* 3 Sub-Features Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {steps[currentStep - 1].features.map((feat, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-left"
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <div className="p-1 rounded bg-indigo-500/20 text-indigo-300">
                                    {FEATURE_ICONS[currentStep - 1]?.[idx] || <Layers size={14} />}
                                  </div>
                                  <h4 className="text-xs font-extrabold text-white truncate">
                                    {feat.title}
                                  </h4>
                                </div>
                                <p className="text-[10px] text-indigo-200/80 leading-snug">
                                  {feat.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Interactive Flip Back Prompt */}
                        <div className="pt-2 border-t border-indigo-900/80 flex items-center justify-between text-xs font-bold text-indigo-300">
                          <span className="flex items-center gap-1.5">
                            <RotateCw size={14} />
                            Hover out or click to flip back
                          </span>
                          <span className="text-[10px] text-indigo-400">HaHu Knowledge Hub</span>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Navigation & Progress Bar */}
            <div className="flex items-center justify-between pt-6 border-t border-indigo-950/80 mt-4">
              {/* Step Progress Indicators */}
              <div className="flex items-center gap-2">
                {Array.from({ length: totalSteps }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setIsFlipped(false);
                      setDirection(idx > currentStep ? 1 : -1);
                      setCurrentStep(idx);
                    }}
                    className={`transition-all duration-300 rounded-full ${
                      idx === currentStep 
                        ? 'w-7 h-2.5 bg-indigo-500 shadow-md shadow-indigo-500/40' 
                        : 'w-2.5 h-2.5 bg-indigo-900/60 hover:bg-indigo-700'
                    }`}
                    title={idx === 0 ? "Welcome" : `Step ${idx}`}
                  />
                ))}
              </div>

              {/* Action Navigation Buttons */}
              <div className="flex items-center gap-3">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrev}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
                      theme === 'light'
                        ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                        : 'bg-indigo-950/80 border-indigo-900 text-slate-300 hover:text-white hover:border-indigo-800'
                    }`}
                  >
                    <ChevronLeft size={16} />
                    {t.tourPrev || "Back"}
                  </button>
                )}

                <button
                  onClick={handleNext}
                  className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black px-6 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  <span>
                    {currentStep === 0
                      ? (t.startTour || "Start Guided Tour")
                      : currentStep === totalSteps - 1
                      ? (t.tourFinish || "Start Now")
                      : (t.tourNext || "Next")}
                  </span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
