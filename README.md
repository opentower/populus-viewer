# Populus-Viewer
*Social Annotation Powered by Matrix*

Populus-Viewer is a tool for decentralized social annotation,
built on [pdfjs](https://mozilla.github.io/pdf.js/) and 
[the Matrix protocol](https://matrix.org). You can use it to read
PDFs and have rich discussions in the margins, with your friends, 
classmates, or scholarly collaborators.

Each uploaded PDF is attached to a matrix space, and each annotation 
to the PDF becomes a room within that space. Populus-Viewer has been 
tested with synapse and dendrite, but should be compatible with any 
spec-compliant matrix server.

To learn more or talk about the project, [find us on Matrix](https://matrix.to/#/#opentower:matrix.org).
The project should currently be considered beta-quality. UX is 
unpolished, bugs are likely, and features are missing. Bug reports and 
feature requests are welcome.

## Features



https://user-images.githubusercontent.com/6383381/146051091-1c1e29b8-0d6c-4b87-9f49-2247e108e34e.mp4



Populus-Viewer currently supports:

- Highlight and pin-drop annotations
- Audio and video messages
- Message edits and redactions
- Replies and reactions
- Unread message counts
- Markdown for text formatting (via [commonmark.js](https://github.com/commonmark/commonmark.js))
- LaTeX for mathematical notation (via [KaTeX](https://katex.org))
- Integration with bots
- Typing notifications
- Room invitations
- Synchronized reading positions across devices
- Single Sign On (via Google, university, or another SSO provider), given a matrix server that supports it

If there's a feature supported by Matrix that you think would make for a 
better social annotation experience, please open an issue or a PR!

## Usage

To try out Populus-Viewer, just point your browser at our [github pages
instance](https://opentower.github.io/populus-viewer). You're welcome to use
the default testing server, but be aware that this server may be torn down or
replaced at any time.

To get started tinkering with the source code, clone this repository and then
run:

* `npm install` to download dependencies and install them locally.
* `npm run-script build` to build the browser JS, which will end up in the `dist` directory. 
* `npm run-script serve` to serve the contents of `dist` at localhost:9000, and auto-reload on changes.

## Prior Art

Similar projects include:

- [Perusall](https://perusall.com)
- [Hypothes.is](https://web.hypothes.is)
- [PeerLibrary](https://peerlibrary.org)
- [BookWyrm](https://joinbookwyrm.com)

But I couldn't resist trying something new :)
