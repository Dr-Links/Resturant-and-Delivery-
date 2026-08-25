require('dotenv').config()

const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const PORT = 3001

const PROJECT_ROOT = path.resolve(
  'C:\\Users\\user\\my-ai-app'
)

// --------------------------------------------------
// SUPABASE
// --------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env'
  )
  process.exit(1)
}

const supabase = createClient(
  supabaseUrl,
  supabaseKey
)

// --------------------------------------------------
// EXPRESS
// --------------------------------------------------

app.use(cors())
app.use(express.json({ limit: '20mb' }))

// --------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'My AI Backend',
  })
})

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
  })
})

// --------------------------------------------------
// SAFE FILE PATH
// --------------------------------------------------

function getSafePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path.')
  }

  const absolutePath = path.resolve(
    PROJECT_ROOT,
    filePath
  )

  const relativePath = path.relative(
    PROJECT_ROOT,
    absolutePath
  )

  if (
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      'File path is outside the project folder.'
    )
  }

  return absolutePath
}

// --------------------------------------------------
// WRITE FILE
// --------------------------------------------------

app.post('/api/files/write', (req, res) => {
  try {
    const { filePath, content } = req.body

    if (!filePath) {
      return res.status(400).json({
        error: 'filePath is required.',
      })
    }

    if (typeof content !== 'string') {
      return res.status(400).json({
        error: 'content must be a string.',
      })
    }

    const absolutePath = getSafePath(filePath)

    const directory = path.dirname(
      absolutePath
    )

    fs.mkdirSync(directory, {
      recursive: true,
    })

    fs.writeFileSync(
      absolutePath,
      content,
      'utf8'
    )

    console.log(
      `File written: ${absolutePath}`
    )

    res.json({
      success: true,
      filePath,
      absolutePath,
    })
  } catch (error) {
    console.error(
      'File write error:',
      error
    )

    res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// READ FILE
// --------------------------------------------------

app.post('/api/files/read', (req, res) => {
  try {
    const { filePath } = req.body

    if (!filePath) {
      return res.status(400).json({
        error: 'filePath is required.',
      })
    }

    const absolutePath = getSafePath(filePath)

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        error: 'File does not exist.',
      })
    }

    const content = fs.readFileSync(
      absolutePath,
      'utf8'
    )

    res.json({
      success: true,
      filePath,
      content,
    })
  } catch (error) {
    console.error(
      'File read error:',
      error
    )

    res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// SAVE MESSAGE TO SUPABASE
// --------------------------------------------------

async function saveMessage(
  sessionId,
  role,
  content
) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
    })

  if (error) {
    console.error(
      'Supabase save error:',
      error
    )

    throw error
  }
}

// --------------------------------------------------
// GET CHAT HISTORY
// --------------------------------------------------

app.get('/api/chat/history/:sessionId', async (
  req,
  res
) => {
  try {
    const { sessionId } = req.params

    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, session_id, role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', {
        ascending: true,
      })

    if (error) {
      console.error(
        'Supabase history error:',
        error
      )

      return res.status(500).json({
        error: error.message,
      })
    }

    res.json({
      success: true,
      messages: data || [],
    })
  } catch (error) {
    console.error(
      'History error:',
      error
    )

    res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// DELETE CHAT HISTORY
// --------------------------------------------------

app.delete('/api/chat/history/:sessionId', async (
  req,
  res
) => {
  try {
    const { sessionId } = req.params

    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId)

    if (error) {
      return res.status(500).json({
        error: error.message,
      })
    }

    res.json({
      success: true,
    })
  } catch (error) {
    res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// AI CHAT
// --------------------------------------------------

app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages,
      sessionId,
    } = req.body

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return res.status(400).json({
        error: 'No messages were provided.',
      })
    }

    if (!sessionId) {
      return res.status(400).json({
        error: 'sessionId is required.',
      })
    }

    // ------------------------------------------------
    // SAVE USER MESSAGE
    // ------------------------------------------------

    const latestMessage =
      messages[messages.length - 1]

    if (
      latestMessage &&
      latestMessage.role === 'user'
    ) {
      await saveMessage(
        sessionId,
        'user',
        latestMessage.content
      )
    }

    // ------------------------------------------------
    // SYSTEM MESSAGE
    // ------------------------------------------------

    const systemMessage = {
      role: 'system',
      content: `
You are the coding assistant for this local project.

Project root:

C:\\Users\\user\\my-ai-app

NORMAL CHAT:

Answer normally.

FILE OPERATIONS:

When the user asks you to create, modify, replace, or write a file, use EXACTLY:

<WRITE_FILE>
FILE_PATH: relative/path/to/file
CONTENT:
complete file contents here
</WRITE_FILE>

Rules:

1. FILE_PATH must be relative.
2. Never use an absolute Windows path.
3. Never write outside the project folder.
4. CONTENT must contain the complete file.
5. Do not use JSON for file operations.
6. Do not escape quotation marks inside file contents.
7. Do not use markdown code fences around the file.
8. Do not put explanations inside the WRITE_FILE block.
9. Keep the exact WRITE_FILE format.
`,
    }

    // ------------------------------------------------
    // OPENROUTER
    // ------------------------------------------------

    const openRouterResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${process.env.OPENROUTER_API_KEY}`,

          'Content-Type':
            'application/json',

          'HTTP-Referer':
            'http://localhost:8081',

          'X-Title':
            'My AI App',
        },

        body: JSON.stringify({
          model: 'stealth/ox-alpha',

          messages: [
            systemMessage,
            ...messages,
          ],
        }),
      }
    )

    const data =
      await openRouterResponse.json()

    console.log(
      'OpenRouter status:',
      openRouterResponse.status
    )

    if (!openRouterResponse.ok) {
      console.error(
        'OpenRouter error:',
        JSON.stringify(
          data,
          null,
          2
        )
      )

      return res.status(
        openRouterResponse.status
      ).json({
        error:
          data?.error?.message ||
          'OpenRouter request failed.',
      })
    }

    const rawReply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      ''

    if (!rawReply) {
      return res.status(502).json({
        error:
          'The AI returned an empty response.',
      })
    }

    console.log(
      'AI response:',
      rawReply
    )

    // ------------------------------------------------
    // FILE OPERATION
    // ------------------------------------------------

    const writeFileMatch =
      rawReply.match(
        /<WRITE_FILE>\s*FILE_PATH:\s*([^\r\n]+)\s*CONTENT:\s*([\s\S]*?)\s*<\/WRITE_FILE>/i
      )

    if (writeFileMatch) {
      const filePath =
        writeFileMatch[1].trim()

      const content =
        writeFileMatch[2]

      const absolutePath =
        getSafePath(filePath)

      const directory =
        path.dirname(
          absolutePath
        )

      fs.mkdirSync(
        directory,
        {
          recursive: true,
        }
      )

      fs.writeFileSync(
        absolutePath,
        content,
        'utf8'
      )

      console.log(
        `AI wrote file: ${absolutePath}`
      )

      const reply =
        `Created ${filePath}`

      await saveMessage(
        sessionId,
        'assistant',
        reply
      )

      return res.json({
        action: 'write_file',
        success: true,
        filePath,
        absolutePath,
        reply,
        model: data.model,
      })
    }

    // ------------------------------------------------
    // NORMAL CHAT
    // ------------------------------------------------

    await saveMessage(
      sessionId,
      'assistant',
      rawReply
    )

    return res.json({
      action: 'chat',
      reply: rawReply,
      model: data.model,
    })
  } catch (error) {
    console.error(
      'Server error:',
      error
    )

    res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `AI server running on port ${PORT}`
    )

    console.log(
      `Project folder: ${PROJECT_ROOT}`
    )
  }
)