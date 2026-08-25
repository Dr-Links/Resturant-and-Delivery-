import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const API_URL = 'http://localhost:3001'

const SESSION_KEY = 'my-ai-session-id'

function createSessionId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 15)}`
}

export default function HomeScreen() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState('')

  // --------------------------------------------------
  // CREATE / LOAD SESSION
  // --------------------------------------------------

  useEffect(() => {
    initializeSession()
  }, [])

  async function initializeSession() {
    try {
      let storedSessionId = ''

      if (
        typeof window !== 'undefined' &&
        window.localStorage
      ) {
        storedSessionId =
          window.localStorage.getItem(
            SESSION_KEY
          ) || ''
      }

      if (!storedSessionId) {
        storedSessionId = createSessionId()

        if (
          typeof window !== 'undefined' &&
          window.localStorage
        ) {
          window.localStorage.setItem(
            SESSION_KEY,
            storedSessionId
          )
        }
      }

      setSessionId(storedSessionId)

      await loadHistory(storedSessionId)
    } catch (error) {
      console.error(
        'Session initialization error:',
        error
      )
    }
  }

  // --------------------------------------------------
  // LOAD CHAT HISTORY
  // --------------------------------------------------

  async function loadHistory(
    currentSessionId: string
  ) {
    try {
      const response = await fetch(
        `${API_URL}/api/chat/history/${encodeURIComponent(
          currentSessionId
        )}`
      )

      const data = await response.json()

      console.log(
        'Chat history response:',
        data
      )

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Unable to load chat history.'
        )
      }

      if (
        Array.isArray(data?.messages)
      ) {
        const history: Message[] =
          data.messages.map(
            (message: any) => ({
              id:
                message.id ||
                `${Date.now()}-${Math.random()}`,

              role:
                message.role === 'user'
                  ? 'user'
                  : 'assistant',

              content:
                message.content || '',
            })
          )

        setMessages(history)
      }
    } catch (error) {
      console.error(
        'History error:',
        error
      )
    }
  }

  // --------------------------------------------------
  // SEND MESSAGE
  // --------------------------------------------------

  async function sendMessage() {
    const text = input.trim()

    if (
      !text ||
      loading ||
      !sessionId
    ) {
      return
    }

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: text,
    }

    const conversation = [
      ...messages,
      userMessage,
    ]

    setMessages(conversation)
    setInput('')
    setLoading(true)

    try {
      const response = await fetch(
        `${API_URL}/api/chat`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            sessionId,

            messages:
              conversation.map(
                (message) => ({
                  role:
                    message.role,
                  content:
                    message.content,
                })
              ),
          }),
        }
      )

      const data =
        await response.json()

      console.log(
        'AI server response:',
        data
      )

      if (!response.ok) {
        const serverError =
          data?.error ||
          data?.details?.error
            ?.message ||
          'AI request failed.'

        throw new Error(
          serverError
        )
      }

      const reply =
        typeof data?.reply ===
        'string'
          ? data.reply.trim()
          : ''

      if (!reply) {
        throw new Error(
          'The AI server returned an empty response.'
        )
      }

      const aiMessage: Message = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: reply,
      }

      setMessages(
        (previous) => [
          ...previous,
          aiMessage,
        ]
      )
    } catch (error) {
      console.error(
        'Chat error:',
        error
      )

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error'

      setMessages(
        (previous) => [
          ...previous,
          {
            id: `${Date.now()}-error`,
            role: 'assistant',
            content:
              `Error: ${errorMessage}`,
          },
        ]
      )
    } finally {
      setLoading(false)
    }
  }

  // --------------------------------------------------
  // NEW CHAT
  // --------------------------------------------------

  async function startNewChat() {
    if (loading) {
      return
    }

    try {
      if (sessionId) {
        await fetch(
          `${API_URL}/api/chat/history/${encodeURIComponent(
            sessionId
          )}`,
          {
            method: 'DELETE',
          }
        )
      }

      const newSessionId =
        createSessionId()

      if (
        typeof window !== 'undefined' &&
        window.localStorage
      ) {
        window.localStorage.setItem(
          SESSION_KEY,
          newSessionId
        )
      }

      setSessionId(
        newSessionId
      )

      setMessages([])
      setInput('')
    } catch (error) {
      console.error(
        'New chat error:',
        error
      )
    }
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            My AI
          </Text>

          <Text style={styles.subtitle}>
            stealth/ox-alpha
          </Text>
        </View>

        <TouchableOpacity
          style={styles.newChatButton}
          onPress={startNewChat}
          disabled={loading}
        >
          <Text style={styles.newChatText}>
            New Chat
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        style={styles.chat}
        data={messages}
        keyExtractor={(item) =>
          item.id
        }
        contentContainerStyle={
          styles.messages
        }
        renderItem={({
          item,
        }) => (
          <View
            style={[
              styles.message,

              item.role ===
              'user'
                ? styles.userMessage
                : styles.aiMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,

                item.role ===
                'user'
                  ? styles.userText
                  : styles.aiText,
              ]}
            >
              {item.content}
            </Text>
          </View>
        )}
      />

      {loading && (
        <View
          style={styles.loading}
        >
          <ActivityIndicator />

          <Text
            style={
              styles.loadingText
            }
          >
            Thinking...
          </Text>
        </View>
      )}

      <View
        style={styles.inputArea}
      >
        <TextInput
          style={styles.input}
          placeholder="Ask anything..."
          placeholderTextColor="#777"
          value={input}
          onChangeText={
            setInput
          }
          onSubmitEditing={
            sendMessage
          }
          editable={!loading}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            loading &&
              styles.disabledButton,
          ]}
          onPress={
            sendMessage
          }
          disabled={loading}
        >
          <Text
            style={
              styles.sendText
            }
          >
            Send
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#ffffff',
    },

    header: {
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor:
        '#e5e5e5',
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
    },

    title: {
      fontSize: 26,
      fontWeight: '700',
      color: '#111111',
    },

    subtitle: {
      marginTop: 4,
      fontSize: 14,
      color: '#666666',
    },

    newChatButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor:
        '#eeeeee',
    },

    newChatText: {
      color: '#111111',
      fontWeight: '600',
    },

    chat: {
      flex: 1,
    },

    messages: {
      padding: 16,
      gap: 10,
    },

    message: {
      maxWidth: '85%',
      padding: 12,
      borderRadius: 14,
    },

    userMessage: {
      alignSelf:
        'flex-end',
      backgroundColor:
        '#007aff',
    },

    aiMessage: {
      alignSelf:
        'flex-start',
      backgroundColor:
        '#eeeeee',
    },

    messageText: {
      fontSize: 16,
      lineHeight: 22,
    },

    userText: {
      color: '#ffffff',
    },

    aiText: {
      color: '#111111',
    },

    loading: {
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },

    loadingText: {
      color: '#555555',
    },

    inputArea: {
      flexDirection:
        'row',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor:
        '#e5e5e5',
    },

    input: {
      flex: 1,
      minHeight: 44,
      borderWidth: 1,
      borderColor:
        '#cccccc',
      borderRadius: 10,
      paddingHorizontal: 12,
      fontSize: 16,
      color: '#111111',
    },

    sendButton: {
      minWidth: 70,
      paddingHorizontal: 16,
      justifyContent:
        'center',
      alignItems:
        'center',
      borderRadius: 10,
      backgroundColor:
        '#007aff',
    },

    disabledButton: {
      opacity: 0.5,
    },

    sendText: {
      color: '#ffffff',
      fontWeight: '600',
    },
  })