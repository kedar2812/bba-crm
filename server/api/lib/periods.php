<?php
/**
 * Period ranges and the shared counting rules (DPR §9).
 * All totals sum shared rows — never per-member sides — so nothing counts twice.
 */

/** @return array [from, to, prevFrom, prevTo, label] as Y-m-d strings (to is inclusive) */
function period_range($period)
{
    $t = time();
    $y = (int) date('Y', $t);
    $m = (int) date('n', $t);
    switch ($period) {
        case 'last_month':
            $from = date('Y-m-01', mktime(0, 0, 0, $m - 1, 1, $y));
            $to = date('Y-m-t', strtotime($from));
            $pf = date('Y-m-01', mktime(0, 0, 0, $m - 2, 1, $y));
            $pt = date('Y-m-t', strtotime($pf));
            return array($from, $to, $pf, $pt, date('F Y', strtotime($from)));
        case 'this_quarter':
            $qs = (int) (floor(($m - 1) / 3) * 3 + 1);
            $from = date('Y-m-d', mktime(0, 0, 0, $qs, 1, $y));
            $to = date('Y-m-t', mktime(0, 0, 0, $qs + 2, 1, $y));
            $pf = date('Y-m-d', mktime(0, 0, 0, $qs - 3, 1, $y));
            $pt = date('Y-m-t', mktime(0, 0, 0, $qs - 1, 1, $y));
            return array($from, $to, $pf, $pt, 'This quarter');
        case 'this_year':
            return array($y . '-01-01', $y . '-12-31', ($y - 1) . '-01-01', ($y - 1) . '-12-31', (string) $y);
        case 'all':
            return array('2000-01-01', '2999-12-31', null, null, 'All time');
        default:
            $from = date('Y-m-01', $t);
            $to = date('Y-m-t', $t);
            $pf = date('Y-m-01', mktime(0, 0, 0, $m - 1, 1, $y));
            $pt = date('Y-m-t', strtotime($pf));
            return array($from, $to, $pf, $pt, date('F Y', $t));
    }
}

/** Valid from/to from the query string (swapped if reversed), or null. */
function custom_range()
{
    $from = qs('from');
    $to = qs('to');
    $re = '/^\d{4}-\d{2}-\d{2}$/';
    if (!is_string($from) || !is_string($to) || !preg_match($re, $from) || !preg_match($re, $to) || !strtotime($from) || !strtotime($to)) {
        return null;
    }
    return $from <= $to ? array($from, $to) : array($to, $from);
}

/** Custom from/to from the query string, defaulting to this month. */
function range_from_query()
{
    $c = custom_range();
    if (!$c) {
        $r = period_range(qs('period', 'this_month'));
        return array($r[0], $r[1]);
    }
    return $c;
}

/** "5 Oct – 20 Oct 2026", "5 Dec 2025 – 20 Jan 2026" or "5 Oct 2026". */
function range_label($from, $to)
{
    $a = strtotime($from);
    $b = strtotime($to);
    if ($from === $to) {
        return date('j M Y', $a);
    }
    return (date('Y', $a) === date('Y', $b) ? date('j M', $a) : date('j M Y', $a)) . ' – ' . date('j M Y', $b);
}

/**
 * period_range() plus period=custom (from/to in the query string). A custom range is
 * compared with the same number of days just before it.
 * @return array [from, to, prevFrom, prevTo, label]
 */
function range_with_prev()
{
    $period = qs('period', 'this_month');
    $c = $period === 'custom' ? custom_range() : null;
    if (!$c) {
        return period_range($period === 'custom' ? 'this_month' : $period);
    }
    list($from, $to) = $c;
    $days = (int) round((strtotime($to) - strtotime($from)) / 86400) + 1;
    $pt = date('Y-m-d', strtotime($from . ' -1 day'));
    $pf = date('Y-m-d', strtotime($from . ' -' . $days . ' days'));
    return array($from, $to, $pf, $pt, range_label($from, $to));
}

/**
 * Chart buckets sized to the range: days (up to 2 weeks), weeks (up to ~3 months),
 * months (up to 2 years), else years. Days after today are left off, and an
 * open-ended range ("All time") starts at the earliest record.
 * @return array ['grain' => day|week|month|year, 'buckets' => [key => label]]
 */
function chart_buckets($from, $to, $earliest = null)
{
    $today = today();
    if ($to > $today && $from <= $today) {
        $to = $today;
    }
    if ((strtotime($to) - strtotime($from)) / 86400 > 731) {
        $earliest = $earliest ? substr($earliest, 0, 10) : null;
        $from = max($from, $earliest ? $earliest : date('Y-m-01', strtotime($to . ' -5 months')));
    }
    $days = (int) round((strtotime($to) - strtotime($from)) / 86400) + 1;
    if ($days <= 14) {
        $grain = 'day';
    } elseif ($days <= 92) {
        $grain = 'week';
    } elseif ($days <= 731) {
        $grain = 'month';
    } else {
        $grain = 'year';
    }
    $multiYear = substr($from, 0, 4) !== substr($to, 0, 4);
    $buckets = array();
    $t = strtotime(bucket_key($from, $grain === 'week' ? 'week' : 'day'));
    $end = strtotime($to);
    while ($t <= $end) {
        $d = date('Y-m-d', $t);
        $key = bucket_key($d, $grain);
        if (!isset($buckets[$key])) {
            if ($grain === 'day' || $grain === 'week') {
                $buckets[$key] = date('j M', strtotime(max($d, $from)));
            } elseif ($grain === 'month') {
                $buckets[$key] = $multiYear ? date('M', $t) . ' ’' . date('y', $t) : date('M', $t);
            } else {
                $buckets[$key] = date('Y', $t);
            }
        }
        $y = (int) date('Y', $t);
        $m = (int) date('n', $t);
        $dd = (int) date('j', $t);
        if ($grain === 'day') {
            $t = mktime(0, 0, 0, $m, $dd + 1, $y);
        } elseif ($grain === 'week') {
            $t = mktime(0, 0, 0, $m, $dd + 7, $y);
        } elseif ($grain === 'month') {
            $t = mktime(0, 0, 0, $m + 1, 1, $y);
        } else {
            $t = mktime(0, 0, 0, 1, 1, $y + 1);
        }
    }
    return array('grain' => $grain, 'buckets' => $buckets);
}

/** The chart bucket a date (or datetime) falls in. Weeks start on Monday. */
function bucket_key($date, $grain)
{
    $d = substr($date, 0, 10);
    if ($grain === 'week') {
        $t = strtotime($d);
        return date('Y-m-d', mktime(0, 0, 0, (int) date('n', $t), (int) date('j', $t) - ((int) date('N', $t) - 1), (int) date('Y', $t)));
    }
    if ($grain === 'month') {
        return substr($d, 0, 7);
    }
    if ($grain === 'year') {
        return substr($d, 0, 4);
    }
    return $d;
}

define('LIVE_REF', 'is_void = 0 AND is_disputed = 0');

/** Member-level numbers for a date range. Null member = association totals. */
function stats_for($memberId, $from, $to)
{
    $out = array();
    $toDt = $to . ' 23:59:59';
    if ($memberId) {
        $out['referrals_given'] = (int) val("SELECT COUNT(*) FROM referrals WHERE type = 'referral' AND giver_id = ? AND " . LIVE_REF . ' AND referral_date BETWEEN ? AND ?', array($memberId, $from, $to));
        $out['referrals_received'] = (int) val("SELECT COUNT(*) FROM referrals WHERE type = 'referral' AND receiver_id = ? AND " . LIVE_REF . ' AND referral_date BETWEEN ? AND ?', array($memberId, $from, $to));
        $out['business_received'] = (float) val("SELECT COALESCE(SUM(final_value), 0) FROM referrals WHERE status = 'won' AND receiver_id = ? AND " . LIVE_REF . ' AND won_date BETWEEN ? AND ?', array($memberId, $from, $to));
        $out['business_given'] = (float) val("SELECT COALESCE(SUM(final_value), 0) FROM referrals WHERE status = 'won' AND giver_id = ? AND " . LIVE_REF . ' AND won_date BETWEEN ? AND ?', array($memberId, $from, $to));
        $out['ones_done'] = (int) val("SELECT COUNT(*) FROM one_to_ones WHERE status = 'completed' AND (requester_id = ? OR partner_id = ?) AND meeting_at BETWEEN ? AND ?", array($memberId, $memberId, $from . ' 00:00:00', $toDt));
        $out['visitors_invited'] = (int) val('SELECT COUNT(*) FROM visitors WHERE invited_by = ? AND invited_date BETWEEN ? AND ?', array($memberId, $from, $to));
    } else {
        $out['referrals_given'] = (int) val("SELECT COUNT(*) FROM referrals WHERE type = 'referral' AND " . LIVE_REF . ' AND referral_date BETWEEN ? AND ?', array($from, $to));
        $out['business_referred'] = (float) val("SELECT COALESCE(SUM(estimated_value), 0) FROM referrals WHERE type = 'referral' AND " . LIVE_REF . ' AND referral_date BETWEEN ? AND ?', array($from, $to));
        $out['business_closed'] = (float) val("SELECT COALESCE(SUM(final_value), 0) FROM referrals WHERE status = 'won' AND " . LIVE_REF . ' AND won_date BETWEEN ? AND ?', array($from, $to));
        $out['ones_done'] = (int) val("SELECT COUNT(*) FROM one_to_ones WHERE status = 'completed' AND meeting_at BETWEEN ? AND ?", array($from . ' 00:00:00', $toDt));
        $out['visitors_invited'] = (int) val('SELECT COUNT(*) FROM visitors WHERE invited_date BETWEEN ? AND ?', array($from, $to));
        $out['visitors_joined'] = (int) val("SELECT COUNT(*) FROM visitors WHERE status = 'joined' AND invited_date BETWEEN ? AND ?", array($from, $to));
    }
    return $out;
}

/** Attendance % for a member over a range (excused meetings are left out). */
function attendance_pct($memberId, $from, $to)
{
    $rows = all('SELECT a.status, COUNT(*) AS n FROM attendance a JOIN meetings mt ON mt.id = a.meeting_id
        WHERE a.member_id = ? AND mt.meeting_date BETWEEN ? AND ? GROUP BY a.status', array($memberId, $from, $to));
    $present = 0;
    $absent = 0;
    foreach ($rows as $r) {
        if ($r['status'] === 'present') {
            $present = (int) $r['n'];
        } elseif ($r['status'] === 'absent') {
            $absent = (int) $r['n'];
        }
    }
    $den = $present + $absent;
    return $den ? (int) round($present * 100 / $den) : null;
}

function quarter_range()
{
    $r = period_range('this_quarter');
    return array($r[0], $r[1]);
}
