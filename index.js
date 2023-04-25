const fs = require("fs");
const player = require("play-sound")({});
const gtts = require("gtts");
const path = require("path");
const Epub = require("epub");
const { convert } = require("html-to-text");
const { exec } = require("child_process");
const inquirer = require("inquirer");
const lodash = require("lodash");

function runBashCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

function readEpub(epubFilePath) {
  return new Promise((resolve, reject) => {
    const epub = new Epub(epubFilePath);

    epub.on("error", (error) => {
      reject(error);
    });

    epub.on("end", async () => {
      const bookMetadata = {
        title: epub.metadata.title,
        author: epub.metadata.creator,
        description: epub.metadata.description,
        contents: [],
      };

      for (const chapter of epub.flow) {
        try {
          const chapterContent = await getChapterContent(epub, chapter);

          bookMetadata.contents.push({
            id: chapter.id,
            title: chapter.title,
            order: chapter.order,
            content: convert(chapterContent),
          });
        } catch (error) {
          console.error(
            `Bölüm "${chapter.title}" okunurken hata oluştu:`,
            error
          );
        }
      }

      resolve(bookMetadata);
    });

    epub.parse();
  });
}

function getChapterContent(epub, chapter) {
  return new Promise((resolve, reject) => {
    epub.getChapter(chapter.id, (error, text) => {
      if (error) {
        reject(error);
      } else {
        resolve(text);
      }
    });
  });
}

async function convertTextToSpeech(text, fileName, lang) {
  const tts = new gtts(text, lang);
  return new Promise((resolve, reject) => {
    tts.save(fileName, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

async function playAudio(fileName) {
  return new Promise((resolve, reject) => {
    const audio = player.play(fileName, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function splitTextToParagraphs(text) {
  return text.split("\n").filter((paragraph) => paragraph.trim().length > 0);
}

async function playSelectedChapter(bookMetadata) {
  const chapterChoices = lodash.reverse(
    bookMetadata.contents.map((chapter) => ({
      name: `Chapter: ${chapter.id}`,
      value: chapter.id,
    }))
  );

  const { selectedChapterId } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedChapterId",
      message: "Select chapter",
      choices: chapterChoices,
    },
  ]);

  const selectedChapter = bookMetadata.contents.find(
    (chapter) => chapter.id === selectedChapterId
  );

  if (selectedChapter.content.length > 0) {
    console.log(`${selectedChapter.id} is reading...`);
    const paragraphs = splitTextToParagraphs(selectedChapter.content);

    for (const [index, paragraph] of paragraphs.entries()) {
      const audioFileName = `temp_voice_${selectedChapter.id}-${index}.mp3`;
      await convertTextToSpeech(paragraph, audioFileName, "en");
      await playAudio(audioFileName);
      fs.unlinkSync(audioFileName);
    }
  }
}

(async () => {
  await runBashCommand("rm -rf temp_voice_*");
  const epubFilePath = path.resolve(
    __dirname,
    "Spiritual-Evolution-obooko-rel0109.epub"
  );
  const bookMetadata = await readEpub(epubFilePath);
  await playSelectedChapter(bookMetadata);
})();
