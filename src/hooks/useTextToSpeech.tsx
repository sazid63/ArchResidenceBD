import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../i18n";
import { Button } from "../ui/kit";

interface TTSOptions {
  rate?: number;      // 0.1 to 10, default 1
  pitch?: number;     // 0 to 2, default 1
  volume?: number;    // 0 to 1, default 1
  lang?: string;      // 'bn-BD' or 'en-US'
}

export function useTextToSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const { lang } = useI18n();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSupported(true);
      
      const loadVoices = () => {
        const available = window.speechSynthesis.getVoices();
        setVoices(available);
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);

  const speak = useCallback((text: string, options?: TTSOptions) => {
    if (!supported) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.rate ?? 1;
    utterance.pitch = options?.pitch ?? 1;
    utterance.volume = options?.volume ?? 1;
    
    // Select appropriate voice based on language
    const targetLang = options?.lang ?? (lang === 'bn' ? 'bn-BD' : 'en-US');
    const preferredVoice = voices.find(v => v.lang.startsWith(targetLang.split('-')[0])) 
      ?? voices.find(v => v.lang === 'en-US');
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.lang = targetLang;
    
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  }, [supported, voices, lang]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
  }, [supported]);

  return {
    speak,
    stop,
    pause,
    resume,
    speaking,
    supported,
    voices,
  };
}

/** Button component to read text aloud */
export function ReadAloudButton({ 
  text, 
  label,
  options 
}: { 
  text: string; 
  label?: string;
  options?: TTSOptions;
}) {
  const { t, lang } = useI18n();
  const { speak, stop, speaking, supported } = useTextToSpeech();
  
  if (!supported) return null;
  
  const btnLabel = label ?? (speaking ? '🔇' : '🔊');
  const ariaLabel = speaking
    ? (lang === 'bn' ? 'পড়া বন্ধ করুন' : 'Stop reading')
    : (lang === 'bn' ? 'পড়ে শোনান' : 'Read aloud');

  return (
    <Button
      variant="ghost"
      onClick={() => speaking ? stop() : speak(text, options)}
      title={ariaLabel}
      aria-label={ariaLabel}
      aria-pressed={speaking}
      style={{
        padding: '4px 8px',
        fontSize: '11px',
        minWidth: 'auto',
        width: 'auto'
      }}
    >
      {btnLabel}
    </Button>
  );
}

/** Hook to read compliance rules, BOQ items, etc. */
export function useAccessibilityReader() {
  const { speak, stop, speaking, supported } = useTextToSpeech();
  const { lang } = useI18n();

  const readRule = useCallback((ruleId: string, title: string, description: string) => {
    const text = lang === 'bn' 
      ? `নিয়ম ${ruleId}: ${title}. ${description}`
      : `Rule ${ruleId}: ${title}. ${description}`;
    speak(text, { rate: 0.9 });
  }, [speak, lang]);

  const readBOQItem = useCallback((item: string, quantity: string, unit: string, price: string) => {
    const text = lang === 'bn'
      ? `${item}: ${quantity} ${unit}, মূল্য ${price} টাকা`
      : `${item}: ${quantity} ${unit}, price ${price} Taka`;
    speak(text, { rate: 1 });
  }, [speak, lang]);

  const readComplianceStatus = useCallback((status: 'pass' | 'warning' | 'fail', message: string) => {
    const statusText = status === 'pass' 
      ? (lang === 'bn' ? 'পাস' : 'Pass')
      : status === 'warning'
        ? (lang === 'bn' ? 'সতর্কতা' : 'Warning')
        : (lang === 'bn' ? 'ব্যর্থ' : 'Fail');
    speak(`${statusText}: ${message}`, { rate: 0.9 });
  }, [speak, lang]);

  return {
    readRule,
    readBOQItem,
    readComplianceStatus,
    stop,
    speaking,
    supported,
  };
}