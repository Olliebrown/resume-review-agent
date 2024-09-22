# Resume Review Agent
This is a tool that will review resumes and provide feedback on how to improve them. It utilizes a locally installed and running LLM AI tool. It is designed specifically to help review resumes for the CS program at UW Stout.

## Installation & Usage
You will need a locally installed instance of Ollama with the mistral LLM running on your network. Edit the `src/langchainHelper.js` file to the IP address and port of this instance. See [https://github.com/jacoblee93/fully-local-pdf-chatbot] for instructions on configuring Ollama and installing Mistral.

Once Ollama is configured and running, follow these steps to use the tool:
1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a jobList.json file in `input` folder (see exampleJobList.json for format)
4. Edit src/index.js to adjust questions or text used and set the jobList to your file.
5. Run `npm start` to start the program.

All reports generated will be stored in the output folder.

## Credits
This project was inspired by the ['fully local pdf chatbot'](https://github.com/jacoblee93/fully-local-pdf-chatbot) by jacoblee93. It utilizes the [LangChain.js API](https://js.langchain.com/docs/introduction/) to interact with the LLM and communicate the resume context and the chat history.
