"""The police script's own logic (plan "Police check-ins over Telegram", edge case 15): the signature the game checks,
what each call outcome tells the game, sorting a reply's steps, and replies reaching the right waiting call.

    .venv/bin/python -m unittest test_police_call.py
"""
import asyncio
import unittest

import police_call as pc

SECRET = 'line-secret-for-tests'
# The same vector is in functions/test/telegramHttp.test.ts, so the script and the function agree.
VECTOR = ('1792400000', '{"op":"poll"}', '9ddc8b65b98432e0247193fd2035210b4af65e07f602bb6eebc2a3b5603418b8')


class Signing(unittest.TestCase):
    def test_signs_timestamp_dot_body_like_the_function(self):
        timestamp, body, signature = VECTOR
        self.assertEqual(pc.sign_body(SECRET, timestamp, body), signature)

    def test_another_body_or_secret_signs_differently(self):
        timestamp, body, signature = VECTOR
        self.assertNotEqual(pc.sign_body(SECRET, timestamp, body + ' '), signature)
        self.assertNotEqual(pc.sign_body('another', timestamp, body), signature)


class Outcomes(unittest.TestCase):
    def test_each_outcome_is_the_status_twilio_would_send(self):
        self.assertEqual(pc.outcome_params('declined'), {'CallStatus': 'busy'})
        self.assertEqual(pc.outcome_params('busy'), {'CallStatus': 'busy'})
        self.assertEqual(pc.outcome_params('no-answer'), {'CallStatus': 'no-answer'})
        self.assertEqual(pc.outcome_params('privacy'), {'CallStatus': 'failed', 'ErrorCode': 'tg-privacy'})
        self.assertEqual(pc.outcome_params('not-found'), {'CallStatus': 'failed', 'ErrorCode': 'tg-not-found'})
        self.assertEqual(pc.outcome_params('failed'), {'CallStatus': 'failed', 'ErrorCode': 'tg-error'})


class Steps(unittest.TestCase):
    def test_sorts_a_reply_into_what_to_say_the_ask_and_the_hang_up(self):
        ask = {'say': ['What is seven times eight?', 'Reply to our message with your answer.'], 'message': 'Q?', 'replySec': 60, 'next': {'call': 'c1', 'step': 'gather', 'try': '1'}}
        self.assertEqual(
            pc.split_steps([{'say': 'Evening.', 'line': 'intro-watch'}, {'ask': ask}]),
            {'say': ['Evening.'], 'ask': ask, 'hangup': False},
        )
        self.assertEqual(
            pc.split_steps([{'say': 'Correct. Goodbye.', 'line': 'pass'}, {'hangup': True}]),
            {'say': ['Correct. Goodbye.'], 'ask': None, 'hangup': True},
        )
        self.assertEqual(pc.split_steps([]), {'say': [], 'ask': None, 'hangup': False})


class Replies(unittest.TestCase):
    def test_a_reply_reaches_only_its_own_players_waiting_call(self):
        async def go():
            replies = pc.Replies()
            alice = replies.expect(1)
            bob = replies.expect(2)
            self.assertTrue(replies.deliver(1, '56'))
            self.assertEqual(await asyncio.wait_for(alice, 1), '56')
            self.assertFalse(bob.done())
            # Nobody is waiting on carol, and alice's call has had its reply.
            self.assertFalse(replies.deliver(3, '12'))
            self.assertFalse(replies.deliver(1, 'again'))
            replies.deliver(2, '7')
            self.assertEqual(await asyncio.wait_for(bob, 1), '7')

        asyncio.run(go())


class ServeConfig(unittest.TestCase):
    def test_needs_the_url_and_the_secret(self):
        self.assertEqual(
            pc.serve_config({'TELEGRAM_LINE_URL': 'https://example.test/telegramLine', 'TELEGRAM_LINE_SECRET': 's'}),
            ('https://example.test/telegramLine', 's'),
        )
        for env in ({}, {'TELEGRAM_LINE_URL': 'https://example.test/telegramLine'}, {'TELEGRAM_LINE_SECRET': 's'}, {'TELEGRAM_LINE_URL': ' ', 'TELEGRAM_LINE_SECRET': 's'}):
            with self.assertRaises(SystemExit, msg=str(env)):
                pc.serve_config(env)


if __name__ == '__main__':
    unittest.main()
