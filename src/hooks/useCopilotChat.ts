import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { formatChatErrorMessage } from '../utils/error';
import { logger } from '../utils/logger';
import { newMessageId } from '../utils/messageId';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  created_at: string;
  sources?: string[];
}

export const MAX_HISTORY_MESSAGES = 50;

export const CHAT_HISTORY_KEY_PREFIX = '@copilot_chat_history_';

export const getChatHistoryStorageKey = (userId: string, matchId: string | null) =>
  `${CHAT_HISTORY_KEY_PREFIX}${userId}_${matchId ?? 'general'}`;

// Kijelentkezéskor az eszközön tárolt beszélgetés-előzményt el kell dobni:
// a tulajdonosi döntés szerint nem titkosítva tároljuk, hanem kilépéskor töröljük.
// Csak a saját előhívónkkal kezdődő kulcsokat érinti, más tárolt adatot nem.
export const clearStoredChatHistory = async (): Promise<void> => {
  const keys = await AsyncStorage.getAllKeys();
  const chatKeys = keys.filter(key => key.startsWith(CHAT_HISTORY_KEY_PREFIX));
  if (chatKeys.length > 0) {
    await AsyncStorage.multiRemove(chatKeys);
  }
};

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

    // The whole send runs inside try: anything that throws (2026-10-19 it was a missing global
    // `crypto` on the device, before the request even left) must surface as an error message in
    // the chat, never as a silently swallowed rejection that leaves the text in the input.
    try {
      const userMessage: Message = {
        id: newMessageId(),
        text: userText,
        sender: 'user',
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, userMessage]);
      setInputText('');
      setIsTyping(true);

      // Supabase Edge Function meghívása a valós AI válaszért
      const { data, error: invokeError } = await supabase.functions.invoke('chat-with-gemini', {
        body: {
          message: userText,
          history: messages.slice(-MAX_HISTORY_MESSAGES),
          business_profile_id: profileId || null,
          match_id: matchId
        }
      });

      if (invokeError) {
        // Card [L]: the free daily chat cap answers 403 {code:'chat_daily_limit', error}; the server's Hungarian
        // text is shown as it is instead of the generic failure.
        const ctx = (invokeError as { context?: { status?: number; json?: () => Promise<{ code?: string; error?: string }> } }).context;
        if (ctx?.status === 403 && ctx.json) {
          const body = await ctx.json().catch(() => null);
          if (body?.code === 'chat_daily_limit' && body.error) throw new Error(body.error);
        }
        throw invokeError;
      }
      if (data?.error) throw new Error(data.error);

      const replyText = data?.reply || data?.text || data?.response || '';

      if (!replyText) {
        throw new Error('Sajnálom, hiba történt az AI válasz generálása során. Kérlek, próbáld újra!');
      }

      const sources = Array.isArray(data?.sources) ? data.sources : undefined;

      const aiResponse: Message = {
        id: newMessageId(),
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
        id: newMessageId('err-'),
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
