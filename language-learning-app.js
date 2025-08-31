// --- Configuration and Initialization ---
// A list of supported languages and their codes.
const languages = [
    { name: "English", code: "en-US", latin_alphabet: true },
    { name: "Spanish", code: "es-ES", latin_alphabet: true },
    { name: "French", code: "fr-FR", latin_alphabet: true },
    { name: "German", code: "de-DE", latin_alphabet: true },
    { name: "Chinese (Simplified)", code: "zh-CN", latin_alphabet: false },
    { name: "Japanese", code: "ja-JP", latin_alphabet: false },
    { name: "Korean", code: "ko-KR", latin_alphabet: false },
    { name: "Russian", code: "ru-RU", latin_alphabet: false },
    { name: "Italian", code: "it-IT", latin_alphabet: true },
    { name: "Portuguese", code: "pt-BR", latin_alphabet: true }
];

// Get UI elements
const nativeLangSelect = document.getElementById('native-lang');
const learningLangSelect = document.getElementById('learning-lang');
const topicSelect = document.getElementById('topic-select');
const customTopicInput = document.getElementById('custom-topic-input');
const generateBtn = document.getElementById('generate-btn');
const statusMessage = document.getElementById('status-message');
const errorMessage = document.getElementById('error-message');
const ttsMessage = document.getElementById('tts-message');
const outputContainer = document.getElementById('output-container');
const nativePhraseEl = document.getElementById('native-phrase');
const learningPhraseTextEl = document.getElementById('learning-phrase-text');
const nativePhoneticsEl = document.getElementById('native-phonetics-phrase');
const learningPhoneticsEl = document.getElementById('learning-phonetics-phrase');
const wordByWordContainer = document.getElementById('word-by-word-container');
const nativeLangHeading = document.getElementById('native-lang-heading');
const learningLangHeading = document.getElementById('learning-lang-heading');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const phraseCounter = document.getElementById('phrase-counter');
const learningPhraseEl = document.getElementById('learning-phrase');

// Modal elements
const ttsModal = document.getElementById('tts-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Timer elements
const timerBubble = document.getElementById('timer-bubble');

// State variables
let phrasesData = [];
let currentPhraseIndex = 0;
let voices = [];
let learningLangCode = null;
let timerInterval = null;
const WAIT_TIME = 5 * 60; // 5 minutes in seconds

// Populate dropdowns with languages
function populateDropdowns() {
    languages.forEach(lang => {
        const optionNative = document.createElement('option');
        optionNative.value = lang.code;
        optionNative.textContent = lang.name;
        nativeLangSelect.appendChild(optionNative);

        const optionLearning = optionNative.cloneNode(true);
        learningLangSelect.appendChild(optionLearning);
    });
}

// Asynchronously load the voices available on the device
function loadVoices() {
    voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
        speechSynthesis.onvoiceschanged = () => {
            voices = speechSynthesis.getVoices();
        };
    }
}

/**
 * Uses the Web Speech API to speak a given text.
 * The language is now determined by the global learningLangCode variable.
 * @param {string} text The text to be spoken.
 */
function speakText(text) {
    if (!learningLangCode) {
        // We shouldn't get here, but as a safeguard.
        console.error("No learning language code set.");
        return;
    }

    if (window.speechSynthesis) {
        // Check if any voices are available
        if (voices.length === 0) {
            ttsMessage.textContent = 'Text-to-speech is not ready. Please try clicking the text again shortly.';
            ttsMessage.style.display = 'block';
            loadVoices(); // Try to load again
            return;
        }
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Set the language using the global variable.
        utterance.lang = learningLangCode;

        // Find a voice that matches the language code.
        const voice = voices.find(v => v.lang === learningLangCode || v.lang.startsWith(learningLangCode.substring(0, 2)));
        if (voice) {
            utterance.voice = voice;
        }
        
        try {
            window.speechSynthesis.speak(utterance);
            ttsMessage.style.display = 'none'; // Hide message on success
        } catch (e) {
            console.error('TTS speak failed:', e);
            ttsMessage.textContent = 'Speech synthesis failed. Your browser might have restrictions.';
            ttsMessage.style.display = 'block';
        }
    } else {
        errorMessage.textContent = 'Text-to-speech is not supported in this browser.';
        errorMessage.style.display = 'block';
    }
}

/**
 * Calls the Gemini API to generate or translate text.
 * @param {string} prompt The text prompt for the model.
 * @param {object} responseSchema The JSON schema for the desired output.
 * @returns {Promise<any>} The generated JSON object.
 */
async function callGeminiAPI(prompt, responseSchema) {
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = {
        contents: chatHistory,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };
    // API key is not required when using gemini-2.5-flash-preview-05-20, as it's provided by the environment
    const apiKey = "AIzaSyCgCzBWzEeOpMOy_2og9fl7qP3kR44C1No"
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const maxRetries = 5;
    let retries = 0;
    let delay = 1000;

    while (retries < maxRetries) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API response error: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const json = result.candidates[0].content.parts[0].text;
                return JSON.parse(json);
            } else {
                throw new Error('API response format is not as expected.');
            }
        } catch (error) {
            console.error('API call failed:', error);
            retries++;
            if (retries < maxRetries) {
                await new Promise(res => setTimeout(res, delay));
                delay *= 2; // Double the delay for the next retry
            } else {
                throw error; // Re-throw the error after max retries
            }
        }
    }
}

// Displays the current phrase based on the currentPhraseIndex
function displayCurrentPhrase() {
    if (phrasesData.length === 0) {
        return;
    }
    const currentPhrase = phrasesData[currentPhraseIndex];
    nativePhraseEl.textContent = currentPhrase.native;
    learningPhraseTextEl.textContent = currentPhrase.learning;
    
    // Clear previous phonetics and word-by-word
    nativePhoneticsEl.textContent = '';
    learningPhoneticsEl.textContent = '';
    wordByWordContainer.innerHTML = '';

    // Display transliteration if available
    const nativeLang = languages.find(l => l.code === nativeLangSelect.value);
    const learningLang = languages.find(l => l.code === learningLangSelect.value);

    // Determine which phrase gets the transliteration
    if (!nativeLang.latin_alphabet && currentPhrase.native_phonetics) {
        nativePhoneticsEl.textContent = currentPhrase.native_phonetics;
    }
    if (!learningLang.latin_alphabet && currentPhrase.learning_phonetics) {
        learningPhoneticsEl.textContent = currentPhrase.learning_phonetics;
    }

    // Display word-by-word translation
    if (currentPhrase.word_by_word_learning) {
        currentPhrase.word_by_word_learning.forEach(wordObj => {
            const wordTab = document.createElement('div');
            wordTab.className = 'word-tab';

            const originalSpan = document.createElement('span');
            originalSpan.className = 'original-word';
            originalSpan.textContent = wordObj.original;
            wordTab.appendChild(originalSpan);
            
            if (wordObj.transliteration) {
                const transliterationSpan = document.createElement('span');
                transliterationSpan.className = 'transliteration';
                transliterationSpan.textContent = wordObj.transliteration;
                wordTab.appendChild(transliterationSpan);
            }
            
            const translatedSpan = document.createElement('span');
            translatedSpan.className = 'translated-word';
            translatedSpan.textContent = wordObj.translated;
                wordTab.appendChild(translatedSpan);

            // Add click event listener to the word tab.
            // The intention is to speak the original word (e.g., '你好'), not the transliteration ('ni hao').
            // The TTS engine may sometimes get confused by the short text and fall back to a phonetic reading.
            wordTab.addEventListener('click', () => {
                speakText(wordObj.original);
            });

            wordByWordContainer.appendChild(wordTab);
        });
    }

    phraseCounter.textContent = `${currentPhraseIndex + 1}/${phrasesData.length}`;

    // Disable/enable navigation buttons
    prevBtn.disabled = currentPhraseIndex === 0;
    nextBtn.disabled = currentPhraseIndex === phrasesData.length - 1;
}

// Handles click and keydown for next phrase
function showNextPhrase() {
    if (currentPhraseIndex < phrasesData.length - 1) {
        currentPhraseIndex++;
        displayCurrentPhrase();
    }
}

// Handles click and keydown for previous phrase
function showPreviousPhrase() {
    if (currentPhraseIndex > 0) {
        currentPhraseIndex--;
        displayCurrentPhrase();
    }
}

// Timer functions
function startTimer() {
    const endTime = Date.now() + (WAIT_TIME * 1000);
    timerBubble.style.display = 'block';
    setTimeout(() => {
        timerBubble.style.opacity = '1';
    }, 10); // Short delay to allow display to be set
    
    timerInterval = setInterval(() => {
        const timeLeft = Math.floor((endTime - Date.now()) / 1000);
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerBubble.style.opacity = '0';
            setTimeout(() => {
                timerBubble.style.display = 'none';
            }, 500); // Wait for transition to finish
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate New Phrases';
        } else {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            timerBubble.textContent = `Next generation in: ${formattedTime}`;
        }
    }, 1000);
}

// Listen for changes on the topic dropdown to show/hide the custom input
topicSelect.addEventListener('change', () => {
    if (topicSelect.value === 'custom') {
        customTopicInput.style.display = 'block';
        customTopicInput.focus();
    } else {
        customTopicInput.style.display = 'none';
    }
});

// Event listener for the generate button
generateBtn.addEventListener('click', async () => {
    const nativeLangCode = nativeLangSelect.value;
    learningLangCode = learningLangSelect.value; // Store the learning language code in the global variable
    let topic = '';

    const selectedTopic = topicSelect.value;
    if (selectedTopic === 'custom') {
        topic = customTopicInput.value.trim();
    } else {
        const topicMap = {
            'business': 'business',
            'clothes': 'clothes',
            'common_conversation': 'common conversation',
            'computers': 'computers',
            'food_and_drink': 'food and drink',
            'games': 'games',
            'grammar_conjunctions': 'beginner phrases using conjunctions like "and," "or," "but," and "so"',
            'grammar_farewells': 'beginner phrases for farewells and goodbyes',
            'grammar_introductions': 'beginner phrases for self-introductions',
            'grammar_pronouns': 'beginner phrases using pronouns like "I," "you," "he," "she," and "they"',
            'grammar_quantitative': 'beginner phrases using quantitative words like "some," "all," "none," "many," and "few"',
            'grammar_wh': 'beginner phrases using "who," "what," "when," "where," and "why"',
            'school': 'school',
            'science': 'science',
            'shopping': 'shopping',
            'sports': 'sports',
            'technology': 'technology',
        };
        topic = topicMap[selectedTopic] || selectedTopic;
    }

    // Simple validation
    if (!nativeLangCode || !learningLangCode) {
        errorMessage.textContent = 'Please select a native language, a learning language, and a topic.';
        errorMessage.style.display = 'block';
        return;
    }
    
    // Check if custom topic input is empty when 'custom' is selected
    if (selectedTopic === 'custom' && customTopicInput.value.trim() === '') {
        errorMessage.textContent = 'Please enter a custom topic.';
        errorMessage.style.display = 'block';
        return;
    }

    // Disable button, hide previous results, and show loading indicator
    generateBtn.disabled = true;
    outputContainer.style.display = 'none';
    errorMessage.style.display = 'none';
    statusMessage.style.display = 'block';
    currentPhraseIndex = 0;

    try {
        const nativeLang = languages.find(l => l.code === nativeLangSelect.value);
        const learningLang = languages.find(l => l.code === learningLangSelect.value);

        // Update headings
        nativeLangHeading.textContent = nativeLang.name;
        learningLangHeading.textContent = learningLang.name;

        // Define a schema for the structured JSON response
        const phraseSchema = {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    "native": { "type": "STRING" },
                    "learning": { "type": "STRING" },
                    "native_phonetics": { "type": "STRING" },
                    "learning_phonetics": { "type": "STRING" },
                    "word_by_word_learning": {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "original": { "type": "STRING" },
                                "transliteration": { "type": "STRING" },
                                "translated": { "type": "STRING" }
                            },
                            "propertyOrdering": ["original", "transliteration", "translated"]
                        }
                    }
                },
                "propertyOrdering": ["native", "learning", "native_phonetics", "learning_phonetics", "word_by_word_learning"]
            }
        };

        // Create a string of the previous phrases to exclude
        let excludedPhrases = '';
        if (phrasesData.length > 0) {
            const learningPhrasesOnly = phrasesData.map(p => p.learning).join(', ');
            excludedPhrases = `Please ensure none of the new phrases are identical to these: ${learningPhrasesOnly}.`;
        }

        // Create a single, comprehensive prompt using a template literal
        const generationPrompt = `Generate a JSON array of ten random, beginner-level phrases about "${topic}". ${excludedPhrases} For each phrase, provide:
        1. The original text in ${nativeLang.name} ('native' key).
        2. The translation into ${learningLang.name} ('learning' key).
        3. The transliteration of the native text ('native_phonetics' key) if it does not use the Latin alphabet (e.g., pinyin for Chinese, romaji for Japanese, hangul for Korean, Cyrillic for Russian). If it uses the Latin alphabet, the value should be an empty string.
        4. The transliteration of the learning text ('learning_phonetics' key) if it does not use the Latin alphabet. If it does, the value should be an empty string.
        5. A word-by-word translation as a JSON array ('word_by_word_learning' key). Each object in the array should have three keys: 'original' for the word in the learning language, 'transliteration' for its phonetic spelling (if applicable, otherwise empty), and 'translated' for its English translation. Ensure the word-by-word list corresponds to the full learning phrase.`;

        // Call the API once to get all the data
        const generatedPhrases = await callGeminiAPI(generationPrompt, phraseSchema);

        // Update the phrasesData with the new list
        phrasesData = generatedPhrases;

        // Display the first phrase and show the container
        displayCurrentPhrase();
        outputContainer.style.display = 'block';

        // Start the 5-minute cooldown timer
        startTimer();

    } catch (error) {
        console.error('Failed to generate or translate phrases:', error);
        errorMessage.textContent = 'Sorry, something went wrong. Please try again.';
        errorMessage.style.display = 'block';
    } finally {
        // Hide the loading indicator
        statusMessage.style.display = 'none';
    }
});

// Event listeners for navigation buttons
prevBtn.addEventListener('click', showPreviousPhrase);
nextBtn.addEventListener('click', showNextPhrase);

// Event listener for keyboard arrow keys
document.addEventListener('keydown', (e) => {
    if (outputContainer.style.display === 'block') {
        if (e.key === 'ArrowLeft') {
            showPreviousPhrase();
        } else if (e.key === 'ArrowRight') {
            showNextPhrase();
        }
    }
});

// Add click event listener to the learning phrase itself
learningPhraseEl.addEventListener('click', () => {
    const currentPhrase = phrasesData[currentPhraseIndex];
    if (currentPhrase) {
        speakText(currentPhrase.learning);
    }
});

// Event listener for the modal close button
modalCloseBtn.addEventListener('click', () => {
    ttsModal.style.display = 'none';
});

// A single function to run on window load to handle all initialization
window.onload = () => {
    populateDropdowns();
    loadVoices();
    // Show the modal on page load
    ttsModal.style.display = 'flex';
};
