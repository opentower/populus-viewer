# Populus-Viewer
*A Social Annotation Tool Powered by Matrix*

Populus-Viewer leverages [pdfjs](https://mozilla.github.io/pdf.js/) 
and [the Matrix protocol](https://matrix.org) to provide a decentralized 
platform for social annotation of PDFs. You can use it to read pdfs and 
have rich discussions in the margins, with your friends, classmates, or
scholarly collaborators.

Each uploaded PDF is attached to a matrix space, and each annotation 
to the PDF becomes a room within that space. Populus-viewer has been 
tested with synapse and dendrite, but should be compatible with any 
spec-compliant matrix server.

To learn more or talk about the project, [find us on Matrix](https://matrix.to/#/#opentower:matrix.org).
The project should currently be considered beta-quality. Bug reports 
and feature requests are welcome.

## Features

Populus-Viewer currently supports

- Recording audio and video messages
- Rich media messages
- User Avatars
- Replies
- Unread counts
- Markdown formatting in messages (via [commonmark.js](https://github.com/commonmark/commonmark.js)
- LaTeX in annotations (via [KaTeX](https://katex.org))
- Integrations with bots
- Typing notifications
- Room Invitations
- Synchronizing last-viewed page across devices
- SSO sign on, given a server that supports it

If there's a feature supported by Matrix that you think would make for a 
better social annotation experience, please open an issue or a PR!

## Prior Art

Similar projects include:

- [Perusall](https://perusall.com)
- [Hypothes.is](https://web.hypothes.is)
- [PeerLibrary](https://peerlibrary.org)

But I couldn't resist trying something new :)
