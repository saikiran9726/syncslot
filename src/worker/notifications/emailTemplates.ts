// SlotSync Email Templates
// Renders clean, accessible HTML and plain-text emails for booking confirmations,
// status changes, reminders, and cancellations with manage & unsubscribe links.

export interface TemplateData {
  businessName: string;
  businessTimezone: string;
  customerName: string;
  serviceName: string;
  startLocalFormatted: string; // e.g. "Wednesday, Oct 29, 2026 at 10:30 AM"
  durationMinutes: number;
  priceFormatted: string; // e.g. "₹500"
  referenceCode: string;
  manageUrl: string;
  optOutUrl: string;
  cancellationReason?: string;
}

export function renderEmail(
  templateKey: string,
  data: TemplateData
): { subject: string; html: string; text: string } {
  switch (templateKey) {
    case 'booking_confirmed':
      return {
        subject: `Confirmed: ${data.serviceName} with ${data.businessName} (Ref: ${data.referenceCode})`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.5;">
            <div style="border-bottom: 2px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px;">
              <h1 style="color: #0f766e; font-size: 22px; margin: 0;">Appointment Confirmed</h1>
              <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">${data.businessName}</p>
            </div>
            
            <p>Hi ${data.customerName},</p>
            <p>Your appointment has been successfully confirmed. Here are the details:</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="color: #64748b; padding: 6px 0;">Service:</td>
                  <td style="font-weight: 600; text-align: right;">${data.serviceName}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 6px 0;">Date & Time:</td>
                  <td style="font-weight: 600; text-align: right;">${data.startLocalFormatted}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 6px 0;">Duration:</td>
                  <td style="font-weight: 600; text-align: right;">${data.durationMinutes} min</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 6px 0;">Price:</td>
                  <td style="font-weight: 600; text-align: right;">${data.priceFormatted}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; padding: 6px 0;">Booking Ref:</td>
                  <td style="font-family: monospace; font-weight: bold; text-align: right;">${data.referenceCode}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${data.manageUrl}" style="background: #0f766e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
                Manage or Reschedule Appointment
              </a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 32px;">
              Need to cancel or change your time? Use the manage link above.<br/>
              To stop receiving reminders, you can <a href="${data.optOutUrl}" style="color: #64748b;">unsubscribe here</a>.
            </p>
          </div>
        `,
        text: `Hi ${data.customerName},\n\nYour appointment with ${data.businessName} is confirmed!\n\nService: ${data.serviceName}\nDate & Time: ${data.startLocalFormatted}\nDuration: ${data.durationMinutes} min\nPrice: ${data.priceFormatted}\nBooking Ref: ${data.referenceCode}\n\nManage or reschedule: ${data.manageUrl}\n\nUnsubscribe from reminders: ${data.optOutUrl}`,
      };

    case 'booking_rescheduled':
      return {
        subject: `Rescheduled: ${data.serviceName} with ${data.businessName} (Ref: ${data.referenceCode})`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
            <h2 style="color: #0f766e;">Appointment Rescheduled</h2>
            <p>Hi ${data.customerName}, your appointment has been moved to a new time:</p>
            <p><strong>New Time:</strong> ${data.startLocalFormatted}</p>
            <p><strong>Service:</strong> ${data.serviceName}</p>
            <p><strong>Booking Ref:</strong> ${data.referenceCode}</p>
            <p><a href="${data.manageUrl}">Manage Appointment</a></p>
            <p style="font-size: 12px; color: #94a3b8;"><a href="${data.optOutUrl}">Unsubscribe</a></p>
          </div>
        `,
        text: `Hi ${data.customerName},\n\nYour appointment with ${data.businessName} has been rescheduled to:\n\n${data.startLocalFormatted}\nService: ${data.serviceName}\nRef: ${data.referenceCode}\n\nManage: ${data.manageUrl}\nOpt-out: ${data.optOutUrl}`,
      };

    case 'booking_cancelled':
      return {
        subject: `Cancelled: ${data.serviceName} with ${data.businessName} (Ref: ${data.referenceCode})`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
            <h2 style="color: #dc2626;">Appointment Cancelled</h2>
            <p>Hi ${data.customerName}, your appointment for ${data.serviceName} on ${data.startLocalFormatted} has been cancelled.</p>
            ${data.cancellationReason ? `<p><strong>Reason:</strong> ${data.cancellationReason}</p>` : ''}
            <p>We look forward to welcoming you another time.</p>
          </div>
        `,
        text: `Hi ${data.customerName},\n\nYour appointment for ${data.serviceName} on ${data.startLocalFormatted} with ${data.businessName} has been cancelled.${data.cancellationReason ? `\nReason: ${data.cancellationReason}` : ''}\n\nReference: ${data.referenceCode}`,
      };

    case 'reminder_24h':
    case 'reminder_2h':
    case 'reminder_standard':
    default:
      const timeLead = templateKey === 'reminder_2h' ? '2 hours' : 'tomorrow';
      return {
        subject: `Reminder: ${data.serviceName} ${timeLead} with ${data.businessName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
            <h2 style="color: #0f766e;">Upcoming Appointment Reminder</h2>
            <p>Hi ${data.customerName},</p>
            <p>This is a reminder that your appointment is scheduled for <strong>${data.startLocalFormatted}</strong>.</p>
            <p><strong>Service:</strong> ${data.serviceName} (${data.durationMinutes} min)</p>
            <p><strong>Booking Ref:</strong> ${data.referenceCode}</p>
            <p style="margin: 20px 0;">
              <a href="${data.manageUrl}" style="background: #0f766e; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Manage Appointment</a>
            </p>
            <p style="font-size: 12px; color: #94a3b8;"><a href="${data.optOutUrl}">Unsubscribe from reminders</a></p>
          </div>
        `,
        text: `Hi ${data.customerName},\n\nReminder: Your appointment with ${data.businessName} is at ${data.startLocalFormatted}.\nService: ${data.serviceName}\nRef: ${data.referenceCode}\n\nManage: ${data.manageUrl}\nOpt-out: ${data.optOutUrl}`,
      };
  }
}
