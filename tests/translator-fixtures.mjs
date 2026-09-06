import {
  orders,
  appendReframings,
  chooseReframing,
  setQuestions,
  changeRound,
} from '../lib/domain.ts';
export const svo = {
  subject: 'I',
  verb: 'want to play',
  object: 'Lost Ark',
  rewrite: 'I want to play Lost Ark on my Mac.',
};
export const reframings = orders.map((order, i) => ({
  order,
  text: [
    'I want to play Lost Ark on my Mac.',
    'I have Lost Ark in mind as a game to play on my Mac.',
    'My wish is to play Lost Ark on my Mac.',
    'Playing Lost Ark on my Mac is something I want.',
    'Lost Ark is what I want to play on my Mac.',
    'Lost Ark is the game I would like to play on my Mac.',
  ][i],
  focus: i > 3 ? 'target' : 'verb',
}));
export const questions = [
  'Which official source could confirm compatibility?',
  'What does playable mean for you?',
  'What is stopping you from checking compatibility?',
];
export const unsolved = {
  changes: 'You want to play Lost Ark on your Mac.',
  unresolved: 'A workable way to play is still unknown.',
  svo,
  solved: false,
  handoff: null,
};
export const solved = {
  ...unsolved,
  unresolved: '',
  solved: true,
  handoff: {
    step: 'Check the official Lost Ark system requirements.',
    destination: 'The official Lost Ark support site',
    purpose: 'Identify whether your current setup is supported.',
  },
};
export const withAnswer = (t) =>
  changeRound(
    setQuestions(
      chooseReframing(appendReframings(t, svo, reframings), '231'),
      questions,
    ),
    {
      selected: questions[0],
      answer: 'I can check the official support site.',
    },
  );
export const output = (value) =>
  Response.json({
    status: 'completed',
    output: [
      { content: [{ type: 'output_text', text: JSON.stringify(value) }] },
    ],
  });
