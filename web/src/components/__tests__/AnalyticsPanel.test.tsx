import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline, LineChart } from '../AnalyticsPanel';
import type { ChartPoint } from '../AnalyticsPanel';

describe('Sparkline', () => {
  it('renders nothing with fewer than 2 data points', () => {
    const { container } = render(<Sparkline data={[42]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders nothing with empty data', () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an SVG polyline with valid data', () => {
    const { container } = render(<Sparkline data={[10, 20, 15, 30]} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline?.getAttribute('points')).toBeTruthy();
  });

  it('uses custom dimensions', () => {
    const { container } = render(
      <Sparkline data={[10, 20, 30]} width={100} height={40} />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('100');
    expect(svg?.getAttribute('height')).toBe('40');
  });

  it('uses custom color', () => {
    const { container } = render(
      <Sparkline data={[10, 20, 30]} color="#ff0000" />
    );
    const polyline = container.querySelector('polyline');
    expect(polyline?.getAttribute('stroke')).toBe('#ff0000');
  });
});

describe('LineChart', () => {
  const sampleData: ChartPoint[] = [
    { x: 0, y: 50, label: 'Jan' },
    { x: 1, y: 60, label: 'Feb' },
    { x: 2, y: 55, label: 'Mar' },
    { x: 3, y: 70, label: 'Apr' },
  ];

  it('renders an SVG element', () => {
    const { container } = render(<LineChart data={sampleData} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders a "No data" message with empty data', () => {
    const { container } = render(<LineChart data={[]} />);
    // With empty data, LineChart returns a div instead of SVG
    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
    expect(container.textContent).toContain('No data available');
  });

  it('renders a polyline for data points', () => {
    const { container } = render(<LineChart data={sampleData} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline?.getAttribute('points')).toBeTruthy();
  });

  it('uses custom dimensions', () => {
    const { container } = render(
      <LineChart data={sampleData} width={300} height={150} />
    );
    const svg = container.querySelector('svg');
    // SVG width is always "100%" but viewBox uses the custom dimensions
    expect(svg?.getAttribute('viewBox')).toBe('0 0 300 150');
    expect(svg?.getAttribute('height')).toBe('150');
  });

  it('renders grid lines when showGrid is true', () => {
    const { container } = render(
      <LineChart data={sampleData} showGrid={true} />
    );
    // Grid lines are rendered as line elements
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('renders dot circles when showDots is true', () => {
    const { container } = render(
      <LineChart data={sampleData} showDots={true} />
    );
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(sampleData.length);
  });
});
