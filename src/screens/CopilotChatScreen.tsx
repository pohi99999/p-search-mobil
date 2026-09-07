import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, ActivityIndicator, Surface, IconButton } from 'react-native-paper';
import { useProfile } from '../context/ProfileContext';
import { useCopilotChat, Message } from '../hooks/useCopilotChat';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';


type Props = NativeStackScreenProps<RootStackParamList, 'CopilotChat'>;

const MessageItem = React.memo(({ item }: { item: Message }) => {
  const isUser = item.sender === 'user';
  const isError = item.id.startsWith('err-');

  return (
    <View style={[
      styles.messageRow,
      isUser ? styles.userRow : styles.aiRow
    ]}>
      <Surface style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.aiBubble,
        isError && styles.errorBubble
      ]} elevation={1}>
        <Text style={[
          styles.messageText,
          isUser ? styles.userText : styles.aiText,
          isError && styles.errorText
        ]}>
          {item.text}
        </Text>

        {/* RAG források megjelenítése a válasz alatt */}
        {!isUser && item.sources && item.sources.length > 0 && (
          <View style={styles.sourcesContainer}>
            <Text style={styles.sourcesTitle}>Források:</Text>
            <View style={styles.sourcesList}>
              {item.sources.map((src, index) => (
                <View key={index} style={styles.sourceTag}>
                  <Text style={styles.sourceTagText}>{src}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={[
          styles.timestampText,
          isUser ? styles.userTimestamp : styles.aiTimestamp
        ]}>
          {new Date(item.created_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </Surface>
    </View>
  );
});
MessageItem.displayName = 'MessageItem';


export function CopilotChatScreen({ route, navigation }: Props) {
  const { profile } = useProfile();
  const matchId = route?.params?.matchId || null;
  const flatListRef = useRef<FlatList<Message>>(null);

  const {
    messages,
    inputText,
    setInputText,
    isTyping,
    handleSend
  } = useCopilotChat(matchId, profile?.id);

  // Automatikus görgetés a lista aljára, ha új üzenet érkezik vagy az AI gépel
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isTyping]);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          size={24}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          testID="copilot-chat-back-button"
        />
        <View style={styles.headerTextContainer}>
          <Text variant="titleMedium" style={styles.headerTitle}>AI Pályázati Copilot</Text>
          <Text variant="bodySmall" style={styles.headerSubtitle}>Aktív és intelligens segítség</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MessageItem item={item} />}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          isTyping ? (
            <View style={styles.typingContainer}>
              <Surface style={styles.typingBubble} elevation={1}>
                <ActivityIndicator size="small" color="#1976D2" style={styles.typingIndicator} />
                <Text style={styles.typingText}>Az asszisztens gépel...</Text>
              </Surface>
            </View>
          ) : null
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          mode="outlined"
          value={inputText}
          onChangeText={setInputText}
          placeholder="Írd ide az üzeneted..."
          style={styles.textInput}
          outlineStyle={styles.textInputOutline}
          multiline
          maxLength={500}
          right={
            <TextInput.Icon
              icon="send"
              color={inputText.trim() ? '#1A237E' : '#9E9E9E'}
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping}
            />
          }
          disabled={isTyping}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    elevation: 1,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#1A237E',
  },
  headerSubtitle: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  aiRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: '#1A237E',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: 'white',
  },
  aiText: {
    color: '#212121',
  },
  errorText: {
    color: '#D32F2F',
  },
  timestampText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTimestamp: {
    color: '#C5CAE9',
  },
  aiTimestamp: {
    color: '#9E9E9E',
  },
  typingContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: 6,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    backgroundColor: 'white',
  },
  typingIndicator: {
    marginRight: 8,
  },
  typingText: {
    fontSize: 14,
    color: '#757575',
    fontStyle: 'italic',
  },
  inputContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  textInput: {
    maxHeight: 100,
    backgroundColor: 'white',
  },
  textInputOutline: {
    borderRadius: 24,
  },
  sourcesContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 6,
    width: '100%',
  },
  sourcesTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#757575',
    marginBottom: 4,
  },
  sourcesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sourceTag: {
    backgroundColor: '#ECEFF1',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 4,
  },
  sourceTagText: {
    fontSize: 9,
    color: '#455A64',
    fontWeight: '600',
  }
});
