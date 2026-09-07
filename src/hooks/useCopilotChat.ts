import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { formatChatErrorMessage } from '../utils/error';
import { logger } from '../utils/logger';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  created_at: string;
  sources?: string[];
}

export const MAX_HISTORY_MESSAGES = 50;

export const getChatHistoryStorageKey = (userId: string, matchId: string | null) =>
  `@copilot_chat_history_${userId}_${matchId ?? 'general'}`;

export function useCopilotChat(matchId: string | null, profileId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: 'Szia! Én vagyok a P-Search AI asszisztense. Miben segíthetek a pályázati felkészülésed során?',
      sender: 'ai',
      created_at: new Date().toISOString()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const hasLoadedHistoryRef = useRef(false);

  // Bejelentkezett felhasználó azonosítójának lekérése, hogy a cache kulcsa
  // felhasználónként elkülönüljön (elkerülve a kijelentkezés utáni "átszivárgást")
  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (isMounted) {
          setUserId(data?.session?.user?.id ?? null);
        }
      })
      .catch(err => {
        logger.error('Failed to resolve authenticated user for chat history:', err);
        if (isMounted) {
          setUserId(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Korábbi beszélgetés-előzmény betöltése eszközön tárolt cache-ből
  useEffect(() => {
    hasLoadedHistoryRef.current = false;
    // Ismeretlen felhasználó esetén nem töltünk be és nem is mentünk előzményt,
    // nehogy egy másik felhasználó beszélgetése szivárogjon át (nincs fallback kulcs).
    if (!userId) return;
    const loadHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(getChatHistoryStorageKey(userId, matchId));
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed as Message[]);
          }
        }
      } catch (err) {
        logger.error('Failed to load persisted chat history:', err);
      } finally {
        hasLoadedHistoryRef.current = true;
      }
    };
    loadHistory();
  }, [matchId, userId]);

  // Beszélgetés-előzmény mentése eszközön tárolt cache-be minden változáskor
  useEffect(() => {
    if (!hasLoadedHistoryRef.current || !userId) return;
    const cappedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    AsyncStorage.setItem(getChatHistoryStorageKey(userId, matchId), JSON.stringify(cappedMessages)).catch(err => {
      logger.error('Failed to persist chat history:', err);
    });
  }, [messages, matchId, userId]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      text: userText,
      sender: 'user',
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    try {
      // Supabase Edge Function meghívása a valós AI válaszért
      const { data, error: invokeError } = await supabase.functions.invoke('chat-with-gemini', {
        body: {
          message: userText,
          history: messages.slice(-MAX_HISTORY_MESSAGES),
          business_profile_id: profileId || null,
          match_id: matchId
        }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      const replyText = data?.reply || data?.text || data?.response || '';

      if (!replyText) {
        throw new Error('Sajnálom, hiba történt az AI válasz generálása során. Kérlek, próbáld újra!');
      }

      const sources = Array.isArray(data?.sources) ? data.sources : undefined;

      const aiResponse: Message = {
        id: crypto.randomUUID(),
        text: replyText,
        sender: 'ai',
        created_at: new Date().toISOString(),
        sources: sources
      };

      setMessages(prev => [...prev, aiResponse]);
    } catch (err: unknown) {
      logger.error('Chat error details:', err);
      const errorMessageText = formatChatErrorMessage(err);

      const errorMessage: Message = {
        id: `err-${crypto.randomUUID()}`,
        text: errorMessageText,
        sender: 'ai',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return {
    messages,
    setMessages,
    inputText,
    setInputText,
    isTyping,
    setIsTyping,
    handleSend
  };
}
