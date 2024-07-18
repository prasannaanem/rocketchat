import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom/extend-expect';

import { createRenteionPolicySettingsMock as createMock } from '../../../tests/mocks/client/mockRetentionPolicySettings';
import { createFakeRoom } from '../../../tests/mocks/data';
import { setDate } from '../../../tests/mocks/mockDate';
import RetentionPolicyCallout from './RetentionPolicyCallout';

jest.useFakeTimers();

describe('RetentionPolicyCallout', () => {
	it('Should render callout if settings are valid', () => {
		setDate();
		const fakeRoom = createFakeRoom({ t: 'c' });
		render(<RetentionPolicyCallout room={fakeRoom} />, { wrapper: createMock({ appliesToChannels: true, TTLChannels: 60000 }) });
		expect(screen.getByRole('alert')).toHaveTextContent('a minute June 1, 2024, 12:30 AM');
	});

	it('Should not render callout if settings are invalid', () => {
		setDate();
		const fakeRoom = createFakeRoom({ t: 'c' });
		render(<RetentionPolicyCallout room={fakeRoom} />, {
			wrapper: createMock({ appliesToChannels: true, TTLChannels: 60000, advancedPrecisionCron: '* * * 12 *', advancedPrecision: true }),
		});
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});
});
