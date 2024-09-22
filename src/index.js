import fs from 'fs'
import path from 'path'

// For processing and splitting PDF documents
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

// For text cleaning
import { basicTextCleaning, gatherUnknownWordsFromLine, mergeMisspelledWords, misspellingAtLineBreak, outputUnknownWords, splitLineIntoWords, splitTextIntoLines } from './textCleaner.js'

import { doRAGRequest, addContextDocuments } from './langchainHelper.js'

const MAIN_HEADING = '# AI Review of Resume'
const MAIN_CONTENT = `
This document contains the results of an AI review of your resume. The specific system used was
running on a local machine via [Ollama](https://ollama.com/), powered by the open source weights
from the [Mistral LLM](https://mistral.ai/). No content from your resume was uploaded to the
cloud or provided to a third party in any way.

## How to Interpret the Results
The AI was given no other context besides your resume and a training prompt encouraging it to be
professional and concise and to avoid inventing information. As is often the case, its answer may be
incorrect! Please use your own judgement as you evaluate the results. This is simply intended to
simulate the kind of process that may be in use at employers as they screen job applications and
the questions asked are designed to find common problems that are seen in student resumes.

If the responses you are getting seem wrong, **please reply and let me know!** I will first get you human feedback
but then, I will look closely at why it gave incorrect answers. If it is happening here it may
happen at an employer and get your application discarded before human eyes can intervene!\n\n`

const SUMMARY_HEADING = '## AI Overall Summary'
const SUMMARY_CONTENT = `
The last question the AI was asked was \`'How could this resume be improved?'\`. The answer serves
as a good summary of the overall resume. However, it also tends to suggest adding a lot! Remember
that for the resume book, your resume CANNOT exceed 1 page! Outside that context, a 2-page resume
can be appropriate, but I would not go any longer. Occasionally, the answer seems to be very generic
and this may be a sign that it did not parse your resume correctly.\n\n`

const QUESTIONS_HEADING = '## AI Review Questions'
const QUESTIONS_CONTENT = `
Below is a transcript of questions asked of the AI and its responses. If the response ever starts
with "Hmm, I'm not sure ..." that means the AI did not find the requested information in your resume.
The questions were designed with common mistakes in mind that we see in student resumes. If the AI
suggested something was missing, it probably was and if you can add that information it would be
highly recommended. It it says something was missing but you think it was not, think about how the
document is organized or how you described the information. If the AI couldn't find it, then a
human with hundreds of resumes to review might miss it too!\n\n`

// Array of possible bullet characters to identify text-lists
const bullets = [
  '•', '◦',
  '▪', '▫',
  '■', '□',
  'o', 'O',
  '>', '>>',
  '-',
  '*',
  '+'
]

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50
})

async function prepareForQuery (inputFilename) {
  try {
    // Parse the PDF document to extra important text
    const loader = new PDFLoader(inputFilename)
    const splitDocs = await splitter.splitDocuments(await loader.load())

    // Clean and spell check the text
    splitDocs.forEach((doc) => {
      // Carefully remove extra spaces
      doc.pageContent = basicTextCleaning(doc.pageContent)

      // Split into lines
      const lines = splitTextIntoLines(doc.pageContent)
      const newLines = []
      lines.forEach((line) => {
        // Split into words, check for misspellings, and rebuild line
        const words = splitLineIntoWords(line)
        newLines.push(mergeMisspelledWords(words).join(' '))
      })

      // Consider merging lines
      const bulletLine = newLines.map((line) => bullets.some((bullet) => line.startsWith(bullet)))
      let lastBullet = bulletLine.lastIndexOf(true)
      for (let i = 0; i < newLines.length - 1; i++) {
        // Is this a bulleted line followed by a non-bulleted line?
        if (bulletLine[i] && i !== lastBullet && !bulletLine[i + 1]) {
          // Merge the lines
          newLines[i] = newLines[i] + ' ' + newLines[i + 1]
          newLines.splice(i + 1, 1)
          bulletLine.splice(i + 1, 1)
          lastBullet--
        }

        // Is the last word misspelled?
        if (misspellingAtLineBreak(newLines[i], newLines[i + 1])) {
          // Merge the lines
          // console.log('Misspelled word:', lastWord, '>> Fixed as:', lastWord + firstWord)
          newLines[i] = newLines[i] + newLines[i + 1]
          newLines.splice(i + 1, 1)
          bulletLine.splice(i + 1, 1)
          lastBullet--
        }

        // Gather any remaining unknown words
        gatherUnknownWordsFromLine(newLines[i])
      }

      // Rebuild page content
      doc.pageContent = newLines.join('\n')
    })

    // Add the cleaned text to the context
    await addContextDocuments(splitDocs)
  } catch (err) {
    console.error(err)
  }
}

const questionList = [
  'What is this student\'s goal with this document?',
  'What is this student\'s name and contact info?',
  'What is the student\'s major and minor (if any)?',
  'When does this student graduate?',
  'What is the student\'s GPA?',
  'Does the document clearly list the student\'s technical skills?',
  'Does the document clearly list the student\'s soft skills?',
  'Does the document clearly list the student\'s accomplishments?',
  'Does the document clearly list the student\'s programming languages?',
  'Does the document clearly list the student\'s prior work experience?',
  'Does the document clearly list projects the student has worked on?',
  'Does the document provide any links to the student\'s work?',
  'Does the document mention teamwork or collaboration?',
  'Does the document mention leadership experience?',
  'Does the document mention Agile methodologies or Scrum?',
  'Does the document have a link to the student\'s LinkedIn profile?',
  'Does the document have a link to the student\'s GitHub profile or any GitHub repositories?',
  'Does anything seem to be missing from this document?',
  'How could this resume be improved?'
]

async function askQuestions () {
  // Start with empty message history
  const messages = []
  for (const question of questionList) {
    // Send question and receive response (adding to message history)
    messages.push({ role: 'human', content: question })
    const response = await doRAGRequest(messages)
    messages.push({ role: 'assistant', content: response })
  }

  // Return the array of questions and answers
  return messages
}

function createSummaryFile (outputFilename, messages) {
  // Make sure output file does not exist
  if (fs.existsSync(outputFilename)) {
    fs.unlinkSync(outputFilename)
  }

  // Add the heading and description at the top
  fs.appendFileSync(outputFilename, MAIN_HEADING)
  fs.appendFileSync(outputFilename, MAIN_CONTENT)

  // Add the last answer FIRST
  const lastAnswer = messages.pop()
  const lastQuestion = messages.pop()
  fs.appendFileSync(outputFilename, SUMMARY_HEADING)
  fs.appendFileSync(outputFilename, SUMMARY_CONTENT)
  fs.appendFileSync(outputFilename, '### ' + lastQuestion.content + '\nAI Response:\n')
  fs.appendFileSync(outputFilename, '>' + lastAnswer.content.replace(/\n/g, '\n> ') + '\n\n')

  // Add the rest of the questions and answers
  fs.appendFileSync(outputFilename, QUESTIONS_HEADING)
  fs.appendFileSync(outputFilename, QUESTIONS_CONTENT)
  messages.forEach((message) => {
    if (message.role === 'human') {
      fs.appendFileSync(outputFilename, '### ' + message.content + '\nAI Response:\n')
    } else {
      fs.appendFileSync(outputFilename, '>' + message.content.replace(/\n/g, '\n> ') + '\n\n')
    }
  })
}

async function main (inputJobListFilename) {
  const jobList = JSON.parse(fs.readFileSync(inputJobListFilename))
  for (let job = 0; job < jobList.length; job++) {
    // Ensure output folder exists and is empty
    const name = jobList[job].name
    if (fs.existsSync(path.join('output', name))) {
      fs.rmSync(path.join('output', name), { recursive: true })
    }
    fs.mkdirSync(path.join('output', name))

    const inputFolder = jobList[job].folder
    for (let doc = 0; doc < jobList[job].documents.length; doc++) {
      const baseFilename = jobList[job].documents[doc].split('.')[0]

      // Read in the resume and add to the context
      console.log(`Reading resume from "${baseFilename}.pdf"`)
      await prepareForQuery(path.join(inputFolder, jobList[job].documents[doc]))

      // Run the query to generate prompt responses
      console.log('Running prompts for:', baseFilename)
      const messages = await askQuestions()

      // Write the results out to a summary file
      console.log(`Saving results to "${baseFilename}.md"`)
      createSummaryFile(path.join('output', name, baseFilename + '.md'), messages)
    }
  }

  // Output any unknown words for reference
  outputUnknownWords()
}

main('./input/jobList.json')
