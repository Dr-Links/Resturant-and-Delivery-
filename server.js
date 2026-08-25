require('dotenv').config()

const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3001

const PROJECT_ROOT = path.resolve(
  'C:\\Users\\user\\my-ai-app'
)

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
// SAFE PROJECT PATH
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

    const directory = path.dirname(absolutePath)

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

    return res.json({
      success: true,
      filePath,
      absolutePath,
    })
  } catch (error) {
    console.error(
      'File write error:',
      error
    )

    return res.status(500).json({
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

    const stats = fs.statSync(absolutePath)

    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'The requested path is not a file.',
      })
    }

    const content = fs.readFileSync(
      absolutePath,
      'utf8'
    )

    return res.json({
      success: true,
      filePath,
      content,
    })
  } catch (error) {
    console.error(
      'File read error:',
      error
    )

    return res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// LIST PROJECT FILES
// --------------------------------------------------

app.post('/api/files/list', (req, res) => {
  try {
    function scanDirectory(directory) {
      const entries = fs.readdirSync(
        directory,
        {
          withFileTypes: true,
        }
      )

      const files = []

      for (const entry of entries) {
        const fullPath = path.join(
          directory,
          entry.name
        )

        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name.startsWith('.')
          ) {
            continue
          }

          files.push(
            ...scanDirectory(fullPath)
          )
        } else {
          files.push(
            path.relative(
              PROJECT_ROOT,
              fullPath
            )
          )
        }
      }

      return files
    }

    const files = scanDirectory(
      PROJECT_ROOT
    )

    return res.json({
      success: true,
      files,
    })
  } catch (error) {
    console.error(
      'File list error:',
      error
    )

    return res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// DELETE FILE
// --------------------------------------------------

app.post('/api/files/delete', (req, res) => {
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

    const stats = fs.statSync(absolutePath)

    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'The requested path is not a file.',
      })
    }

    fs.unlinkSync(absolutePath)

    console.log(
      `File deleted: ${absolutePath}`
    )

    return res.json({
      success: true,
      filePath,
      absolutePath,
    })
  } catch (error) {
    console.error(
      'File delete error:',
      error
    )

    return res.status(500).json({
      error: error.message,
    })
  }
})

// --------------------------------------------------
// AI CHAT
// --------------------------------------------------

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return res.status(400).json({
        error: 'No messages were provided.',
      })
    }

    // ----------------------------------------------
    // FIND FILES MENTIONED BY THE USER
    // ----------------------------------------------

    const lastUserMessage =
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === 'user'
        )

    const userText =
      lastUserMessage?.content || ''

    let fileContext = ''

    const fileMatches =
      userText.match(
        /(?:[\w.-]+\/)*[\w.-]+\.(?:js|jsx|ts|tsx|json|css|html|md|txt|py|java|c|cpp|cs|php|sql|yml|yaml|xml|env)/gi
      ) || []

    const uniqueFiles = [
      ...new Set(fileMatches),
    ]

    for (const file of uniqueFiles) {
      try {
        const absolutePath =
          getSafePath(file)

        if (
          fs.existsSync(absolutePath) &&
          fs.statSync(absolutePath).isFile()
        ) {
          const content =
            fs.readFileSync(
              absolutePath,
              'utf8'
            )

          fileContext += `

CURRENT FILE: ${file}

<FILE_CONTENT>
${content}
</FILE_CONTENT>

`
        }
      } catch (fileError) {
        console.log(
          `Could not read ${file}:`,
          fileError.message
        )
      }
    }

    // ----------------------------------------------
    // SYSTEM MESSAGE
    // ----------------------------------------------

    const systemMessage = {
      role: 'system',

      content: `
You are the coding assistant for this local project.

PROJECT ROOT:

C:\\Users\\user\\my-ai-app

You help the user create, read, modify, replace, and delete project files.

NORMAL CHAT:

For normal questions, answer normally.

FILE CREATION:

When the user asks you to create a new file, use:

<WRITE_FILE>
FILE_PATH: relative/path/to/file
CONTENT:
complete file contents
</WRITE_FILE>

FILE MODIFICATION:

When the user asks you to modify an existing file, use the current file contents provided to you and return the COMPLETE modified file using:

<WRITE_FILE>
FILE_PATH: relative/path/to/file
CONTENT:
complete modified file contents
</WRITE_FILE>

FILE DELETION:

When the user asks you to delete a file, use:

<DELETE_FILE>
FILE_PATH: relative/path/to/file
</DELETE_FILE>

RULES:

1. File paths must be relative.
2. Never use an absolute Windows path.
3. Never write outside the project folder.
4. When modifying a file, preserve existing functionality unless the user asks for a change.
5. When modifying a file, return the COMPLETE file.
6. Do not return partial code.
7. Do not use JSON for file operations.
8. Do not use markdown code fences inside WRITE_FILE.
9. Do not put explanations inside WRITE_FILE.
10. For normal questions, answer normally.

${fileContext}
`,
    }

    // ----------------------------------------------
    // OPENROUTER
    // ----------------------------------------------

    const openRouterResponse =
      await fetch(
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

    console.log(
      'AI response:',
      rawReply
    )

    if (!rawReply) {
      return res.status(502).json({
        error:
          'The AI returned an empty response.',
      })
    }

    // ----------------------------------------------
    // DELETE FILE
    // ----------------------------------------------

    const deleteMatch =
      rawReply.match(
        /<DELETE_FILE>\s*FILE_PATH:\s*([^\r\n]+)\s*<\/DELETE_FILE>/i
      )

    if (deleteMatch) {
      const filePath =
        deleteMatch[1].trim()

      try {
        const absolutePath =
          getSafePath(filePath)

        if (
          !fs.existsSync(absolutePath)
        ) {
          return res.status(404).json({
            error:
              'File does not exist.',
          })
        }

        fs.unlinkSync(
          absolutePath
        )

        console.log(
          `AI deleted file: ${absolutePath}`
        )

        return res.json({
          action: 'delete_file',
          success: true,
          filePath,
          absolutePath,
          reply:
            `Deleted ${filePath}`,
          model: data.model,
        })
      } catch (deleteError) {
        console.error(
          'Delete error:',
          deleteError
        )

        return res.status(400).json({
          error:
            deleteError.message,
        })
      }
    }

    // ----------------------------------------------
    // WRITE FILE
    // ----------------------------------------------

    const writeFileMatch =
      rawReply.match(
        /<WRITE_FILE>\s*FILE_PATH:\s*([^\r\n]+)\s*CONTENT:\s*([\s\S]*?)\s*<\/WRITE_FILE>/i
      )

    if (writeFileMatch) {
      const filePath =
        writeFileMatch[1].trim()

      const content =
        writeFileMatch[2]

      console.log(
        'Requested file:',
        filePath
      )

      try {
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

        return res.json({
          action: 'write_file',
          success: true,
          filePath,
          absolutePath,
          reply:
            `Updated ${filePath}`,
          model: data.model,
        })
      } catch (fileError) {
        console.error(
          'File operation error:',
          fileError
        )

        return res.status(400).json({
          error:
            fileError.message,
        })
      }
    }

    // ----------------------------------------------
    // NORMAL CHAT
    // ----------------------------------------------

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

    return res.status(500).json({
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
