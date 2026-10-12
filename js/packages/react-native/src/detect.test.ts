/**
 * `isSeekerDevice` reads `Platform.constants.Model` — spoofable by
 * design (the docs say so), which is acceptable because it only routes
 * connect UX. These tests pin the read, not device authenticity.
 */
import { describe, expect, it, vi } from 'vitest';

const mockPlatform = vi.hoisted(() => ({ constants: { Model: 'Pixel 8' } }));

vi.mock('react-native', () => ({ Platform: mockPlatform }));

const { isSeekerDevice } = await import('./detect.js');

describe('isSeekerDevice', () => {
	it('returns true when the model is exactly "Seeker"', () => {
		mockPlatform.constants.Model = 'Seeker';
		expect(isSeekerDevice()).toBe(true);
	});

	it('returns false for other models', () => {
		mockPlatform.constants.Model = 'Pixel 8';
		expect(isSeekerDevice()).toBe(false);
	});

	it('returns false when constants are absent', () => {
		mockPlatform.constants = undefined as never;
		expect(isSeekerDevice()).toBe(false);
	});
});
