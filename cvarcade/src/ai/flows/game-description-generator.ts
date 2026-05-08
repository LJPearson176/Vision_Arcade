'use server';

/**
 * @fileOverview Generates engaging descriptions for new games added to the Vision Arcade.
 *
 * - generateGameDescription - A function that generates game descriptions.
 * - GameDescriptionInput - The input type for the generateGameDescription function.
 * - GameDescriptionOutput - The return type for the generateGameDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GameDescriptionInputSchema = z.object({
  gameName: z.string().describe('The name of the game.'),
  genre: z.string().describe('The genre of the game (e.g., arcade, puzzle, strategy).'),
  targetAudience: z
    .string()
    .describe('The target audience for the game (e.g., casual gamers, families, esports enthusiasts).'),
  uniqueFeatures: z.string().describe('Unique features of the game.'),
});

export type GameDescriptionInput = z.infer<typeof GameDescriptionInputSchema>;

const GameDescriptionOutputSchema = z.object({
  description: z.string().describe('A compelling description of the game.'),
});

export type GameDescriptionOutput = z.infer<typeof GameDescriptionOutputSchema>;

export async function generateGameDescription(
  input: GameDescriptionInput
): Promise<GameDescriptionOutput> {
  return gameDescriptionGeneratorFlow(input);
}

const prompt = ai.definePrompt({
  name: 'gameDescriptionGeneratorPrompt',
  input: {schema: GameDescriptionInputSchema},
  output: {schema: GameDescriptionOutputSchema},
  prompt: `You are a creative game description writer for Vision Arcade. 

  Your task is to write an engaging and informative description for a new game. 

  The game is called: {{{gameName}}}
  The game genre is: {{{genre}}}
  The target audience is: {{{targetAudience}}}
  The unique features are: {{{uniqueFeatures}}}

  Write a description that will entice users to try out the game. The description must be no more than 150 words.
  `,
});

const gameDescriptionGeneratorFlow = ai.defineFlow(
  {
    name: 'gameDescriptionGeneratorFlow',
    inputSchema: GameDescriptionInputSchema,
    outputSchema: GameDescriptionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
