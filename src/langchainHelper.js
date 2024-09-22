import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts'
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/hf_transformers'
import { ChatOllama } from '@langchain/ollama'

import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents'
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever'

const embeddings = new HuggingFaceTransformersEmbeddings({
  modelName: 'Xenova/all-MiniLM-L6-v2'
  // modelName: 'nomic-ai/nomic-embed-text-v1' // More powerful but slower
})

const OLLAMA_RESPONSE_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on
provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
Generate a concise answer for a given question based solely on the provided context. You must only use information from the provided
context. Use an unbiased and journalistic tone. Combine the context together into a coherent answer. Do not repeat text. If there is
nothing in the context relevant to the question at hand, just say "Hmm, I'm not sure." Don't try to make up an answer.

The context provided represents the resume of a college student that is seeking either an internship or a full-time job. They were
asked to keep the resume short and professional and to focus on their skills gained as a student, projects they have worked on, and
relevant job experience. Please refer to the subject of the resume with they/them pronouns and avoid using gendered language. Please
utilize the Markdown language in your response to style any text and make sure your response is compatible with the Markdown language.

Anything between the following \`context\` html blocks is retrieved from a knowledge bank, not part of the conversation with the user.
<context>
{context}
<context/>

REMEMBER: If there is no relevant information within the context, just say "Hmm, I'm not sure." Don't try to make up an answer.
Anything between the preceding 'context' html blocks is retrieved from a knowledge bank, not part of the conversation with the user.`

const HISTORY_AWARE_PROMPT_TEXT = `Given the above conversation, generate a natural language search query to look up in order to
get information relevant to the conversation. Do not respond with anything except the query.`

const chatModel = new ChatOllama({
  baseUrl: 'http://192.168.50.226:11435',
  temperature: 0.3,
  model: 'mistral'
})

const responseChainPrompt = ChatPromptTemplate.fromMessages([
  ['system', OLLAMA_RESPONSE_SYSTEM_TEMPLATE],
  ['placeholder', '{chat_history}'],
  ['user', '{input}']
])

const documentChain = await createStuffDocumentsChain({
  llm: chatModel,
  prompt: responseChainPrompt,
  documentPrompt: PromptTemplate.fromTemplate(
    '<doc>\n{page_content}\n</doc>'
  )
})

const historyAwarePrompt = ChatPromptTemplate.fromMessages([
  ['placeholder', '{chat_history}'],
  ['user', '{input}'],
  ['user', HISTORY_AWARE_PROMPT_TEXT]
])

async function formatChatHistoryAsMessages (chatHistory) {
  return chatHistory.map((chatMessage) => {
    if (chatMessage.role === 'human') {
      return new HumanMessage(chatMessage.content)
    } else {
      return new AIMessage(chatMessage.content)
    }
  })
}

let vectorstore = null
export async function addContextDocuments (docs, clearStore = true) {
  if (vectorstore == null || clearStore) {
    vectorstore = new MemoryVectorStore(embeddings)
  }

  await vectorstore.addDocuments(docs)
}

export async function doRAGRequest (messages) {
  // Extract most recent message and history separately
  const text = messages[messages.length - 1].content
  const chatHistory = await formatChatHistoryAsMessages(messages.slice(0, -1))

  // Build retrieval chain with history
  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm: chatModel,
    retriever: vectorstore.asRetriever(),
    rephrasePrompt: historyAwarePrompt
  })

  const retrievalChain = await createRetrievalChain({
    combineDocsChain: documentChain,
    retriever: historyAwareRetrieverChain
  })

  // Start retrieval chain streaming
  const fullChain = retrievalChain.pick('answer')
  const stream = await fullChain.stream(
    { input: text, chat_history: chatHistory },
    { callbacks: [] }
  )

  // Gather chunks
  const rawData = []
  for await (const chunk of stream) {
    if (chunk) {
      rawData.push(chunk)
    }
  }

  // Return response
  return rawData.join('')
}
