import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Conversation, ChatMessage, UserRole } from '../types';
import { notificationService } from './notificationService';

const CONVERSATIONS_STORAGE_KEY = 'marketspace_conversations_v1';
const MESSAGES_STORAGE_KEY = 'marketspace_messages_v1';

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_COLLECTION = 'messages';

let memoryConversations: Conversation[] = [];
let memoryMessages: Record<string, ChatMessage[]> = {};

function loadConversations(): Conversation[] {
  if (memoryConversations.length > 0) return memoryConversations;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (!raw) return [];
    memoryConversations = JSON.parse(raw);
    return memoryConversations;
  } catch (err) {
    console.error('Failed to parse conversations storage:', err);
    return [];
  }
}

function persistConversations(items: Conversation[]) {
  memoryConversations = items;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save conversations:', err);
  }
}

function loadMessages(conversationId: string): ChatMessage[] {
  if (memoryMessages[conversationId]) return memoryMessages[conversationId];
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${MESSAGES_STORAGE_KEY}_${conversationId}`);
    if (!raw) return [];
    const list = JSON.parse(raw);
    memoryMessages[conversationId] = list;
    return list;
  } catch (err) {
    console.error('Failed to parse messages storage:', err);
    return [];
  }
}

function persistMessages(conversationId: string, messages: ChatMessage[]) {
  memoryMessages[conversationId] = messages;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${MESSAGES_STORAGE_KEY}_${conversationId}`, JSON.stringify(messages));
  } catch (err) {
    console.error('Failed to persist messages:', err);
  }
}

export const messagingService = {
  /**
   * Real-time subscription to user conversations
   */
  subscribeToConversations(
    userId: string,
    onUpdate: (conversations: Conversation[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!userId) {
      onUpdate([]);
      return () => {};
    }

    // Strict identity validation: Ensure Firebase Auth state matches supplied userId before attaching listener
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid !== userId) {
      return () => {};
    }

    try {
      const q = query(
        collection(db, CONVERSATIONS_COLLECTION),
        where('participantIds', 'array-contains', userId)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const cloud: Conversation[] = [];
          snapshot.forEach(docSnap => {
            cloud.push(docSnap.data() as Conversation);
          });
          const sorted = cloud.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );

          // Update local cache
          const current = loadConversations().filter(
            c => !c.participantIds.includes(userId)
          );
          persistConversations([...current, ...sorted]);
          onUpdate(sorted);
        },
        error => {
          if ((error as any).code === 'permission-denied') {
            console.error('[MessagingService:Security] Permission denied on conversations subscription for user:', userId, error);
            if (onError) onError(error);
            // CRITICAL: Do NOT disguise authorization failures by substituting stale/mock data
            return;
          }
          console.warn('[MessagingService:Network] Conversations snapshot network issue, using cached data:', error);
          const local = loadConversations().filter(c => c.participantIds.includes(userId));
          onUpdate(local.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        }
      );

      return unsubscribe;
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        console.error('[MessagingService:Security] Conversations subscription rejected by security rules:', err);
        if (onError) onError(err);
        return () => {};
      }
      console.warn('Conversations subscription setup error:', err);
      const local = loadConversations().filter(c => c.participantIds.includes(userId));
      onUpdate(local);
      return () => {};
    }
  },

  /**
   * Real-time subscription to messages in a conversation
   */
  subscribeToMessages(
    conversationId: string,
    onUpdate: (messages: ChatMessage[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!conversationId) {
      onUpdate([]);
      return () => {};
    }

    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      return () => {};
    }

    try {
      const q = query(
        collection(db, MESSAGES_COLLECTION),
        where('conversationId', '==', conversationId)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const cloud: ChatMessage[] = [];
          snapshot.forEach(docSnap => {
            cloud.push(docSnap.data() as ChatMessage);
          });
          const sorted = cloud.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          persistMessages(conversationId, sorted);
          onUpdate(sorted);
        },
        error => {
          if ((error as any).code === 'permission-denied') {
            console.error('[MessagingService:Security] Permission denied on messages query for conversation:', conversationId, error);
            if (onError) onError(error);
            return;
          }
          console.warn('[MessagingService:Network] Messages snapshot network error, using local cache:', error);
          const local = loadMessages(conversationId);
          onUpdate(local.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        }
      );

      return unsubscribe;
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        console.error('[MessagingService:Security] Messages setup failed with permission denied:', err);
        if (onError) onError(err);
        return () => {};
      }
      console.warn('Messages subscription setup error:', err);
      const local = loadMessages(conversationId);
      onUpdate(local);
      return () => {};
    }
  },

  /**
   * Find or Create a Conversation
   */
  async getOrCreateConversation(params: {
    participantIds: string[];
    participantDetails: {
      id: string;
      name: string;
      role: UserRole;
      avatar?: string;
    }[];
    contextType: 'order' | 'booking' | 'product' | 'store' | 'general';
    contextId?: string;
    contextTitle?: string;
  }): Promise<Conversation> {
    const list = loadConversations();
    // Normalize participantIds sorted
    const sortedIds = [...params.participantIds].sort();

    // Check existing
    const existing = list.find(c => {
      const cSorted = [...c.participantIds].sort();
      const sameParticipants =
        cSorted.length === sortedIds.length &&
        cSorted.every((id, idx) => id === sortedIds[idx]);
      if (params.contextId) {
        return sameParticipants && c.contextId === params.contextId;
      }
      return sameParticipants && c.contextType === params.contextType;
    });

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newConv: Conversation = {
      id,
      participantIds: sortedIds,
      participantDetails: params.participantDetails,
      contextType: params.contextType,
      contextId: params.contextId,
      contextTitle: params.contextTitle,
      lastMessage: '',
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      unreadCount: {},
    };

    list.unshift(newConv);
    persistConversations(list);

    try {
      await setDoc(doc(db, CONVERSATIONS_COLLECTION, id), newConv);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${CONVERSATIONS_COLLECTION}/${id}`);
    }

    return newConv;
  },

  /**
   * Send a Message
   */
  async sendMessage(params: {
    conversationId: string;
    senderId: string;
    senderName: string;
    senderRole: UserRole;
    text: string;
  }): Promise<ChatMessage> {
    const text = params.text.trim();
    if (!text) {
      throw new Error('Message cannot be empty');
    }
    if (text.length > 2000) {
      throw new Error('Message exceeds 2000 character limit');
    }

    const convList = loadConversations();
    const convIndex = convList.findIndex(c => c.id === params.conversationId);
    if (convIndex === -1) throw new Error('Conversation not found');

    const conversation = convList[convIndex];
    if (!conversation.participantIds.includes(params.senderId)) {
      throw new Error('Unauthorized: Sender is not a participant in this conversation');
    }
    const now = new Date().toISOString();
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newMsg: ChatMessage = {
      id: msgId,
      conversationId: params.conversationId,
      senderId: params.senderId,
      senderName: params.senderName,
      senderRole: params.senderRole,
      text,
      createdAt: now,
    };

    // Update conversation state
    const recipientIds = conversation.participantIds.filter(id => id !== params.senderId);
    const unreadCount = { ...(conversation.unreadCount || {}) };
    recipientIds.forEach(rId => {
      unreadCount[rId] = (unreadCount[rId] || 0) + 1;
    });

    const updatedConv: Conversation = {
      ...conversation,
      lastMessage: text,
      lastMessageAt: now,
      lastSenderId: params.senderId,
      unreadCount,
      updatedAt: now,
    };

    convList[convIndex] = updatedConv;
    persistConversations(convList);

    // Update messages local
    const localMsgs = loadMessages(params.conversationId);
    localMsgs.push(newMsg);
    persistMessages(params.conversationId, localMsgs);

    // Write message & update conversation in Firestore
    try {
      await setDoc(doc(db, MESSAGES_COLLECTION, msgId), newMsg);
      await updateDoc(doc(db, CONVERSATIONS_COLLECTION, params.conversationId), {
        lastMessage: text,
        lastMessageAt: now,
        lastSenderId: params.senderId,
        unreadCount,
        updatedAt: now,
      });
    } catch (err) {
      console.warn('Firestore message save error:', err);
    }

    // Trigger Notification for recipients
    recipientIds.forEach(rId => {
      notificationService.notifyMessageEvent({
        recipientUserId: rId,
        conversationId: params.conversationId,
        senderName: params.senderName,
        textPreview: text,
      }).catch(err => console.warn('Message notification failed:', err));
    });

    return newMsg;
  },

  /**
   * Mark Conversation as Read
   */
  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    const list = loadConversations();
    const target = list.find(c => c.id === conversationId);
    if (target && target.unreadCount && target.unreadCount[userId]) {
      target.unreadCount[userId] = 0;
      persistConversations(list);

      try {
        await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversationId), {
          [`unreadCount.${userId}`]: 0,
        });
      } catch (err) {
        console.warn('Mark conversation read firestore error:', err);
      }
    }
  },

  /**
   * WhatsApp & Phone Link Helpers
   */
  getWhatsAppLink(rawPhone: string, messageText?: string): string {
    const cleanPhone = rawPhone.replace(/[^\d]/g, '');
    const encoded = encodeURIComponent(
      messageText || 'Hello, I am contacting you via MarketSpace regarding my order.'
    );
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  },

  getTelLink(rawPhone: string): string {
    const cleanPhone = rawPhone.replace(/[^\d+]/g, '');
    return `tel:${cleanPhone}`;
  },

  clearUserCache(): void {
    memoryConversations = [];
    memoryMessages = {};
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  },
};
