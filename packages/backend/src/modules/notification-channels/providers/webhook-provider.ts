/**
 * Webhook Notification Provider
 * Sends notifications via HTTP POST to configured URLs
 */

import type { NotificationProvider, NotificationContext, DeliveryResult } from './interface.js';
import type { WebhookChannelConfig, ChannelConfig } from '@logtide/shared';

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'metadata.google.internal'];

function isPrivateIP(hostname: string): boolean {
  // Block link-local, loopback, and private ranges
  if (BLOCKED_HOSTS.includes(hostname.toLowerCase())) return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  // 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 127) return true;
  return false;
}

export class WebhookProvider implements NotificationProvider {
  readonly type = 'webhook' as const;

  async send(context: NotificationContext, channelConfig: ChannelConfig): Promise<DeliveryResult> {
    if (!this.validateConfig(channelConfig)) {
      return { success: false, error: 'Invalid webhook configuration' };
    }

    const webhookConfig = channelConfig as WebhookChannelConfig;

    try {
      const url = new URL(webhookConfig.url);
      if (isPrivateIP(url.hostname)) {
        return { success: false, error: 'Webhook URLs pointing to private/internal addresses are not allowed' };
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'LogTide/1.0',
        ...(webhookConfig.headers || {}),
      };

      // Add authentication if configured
      if (webhookConfig.auth) {
        if (webhookConfig.auth.type === 'bearer' && webhookConfig.auth.token) {
          headers['Authorization'] = `Bearer ${webhookConfig.auth.token}`;
        } else if (
          webhookConfig.auth.type === 'basic' &&
          webhookConfig.auth.username &&
          webhookConfig.auth.password
        ) {
          const credentials = Buffer.from(
            `${webhookConfig.auth.username}:${webhookConfig.auth.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
      }

      const payload = this.buildPayload(context);

      const response = await fetch(webhookConfig.url, {
        method: webhookConfig.method || 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[WebhookProvider] HTTP ${response.status}: ${errorText}`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      console.log(`[WebhookProvider] Sent to ${webhookConfig.url}`);

      return {
        success: true,
        metadata: {
          statusCode: response.status,
          url: webhookConfig.url,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[WebhookProvider] Failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  validateConfig(config: unknown): config is WebhookChannelConfig {
    const c = config as WebhookChannelConfig;
    return (
      typeof c === 'object' &&
      c !== null &&
      typeof c.url === 'string' &&
      (c.url.startsWith('http://') || c.url.startsWith('https://'))
    );
  }

  async test(channelConfig: ChannelConfig): Promise<DeliveryResult> {
    return this.send(
      {
        organizationId: 'test',
        organizationName: 'Test Organization',
        eventType: 'alert',
        title: 'Test Notification',
        message: 'This is a test notification from LogTide to verify your webhook configuration.',
        severity: 'informational',
      },
      channelConfig
    );
  }

  private buildPayload(context: NotificationContext): Record<string, unknown> {
    return {
      event_type: context.eventType,
      title: context.title,
      message: context.message,
      severity: context.severity || 'informational',
      organization: {
        id: context.organizationId,
        name: context.organizationName,
      },
      link: context.link,
      timestamp: new Date().toISOString(),
      metadata: context.metadata || {},
    };
  }
}
